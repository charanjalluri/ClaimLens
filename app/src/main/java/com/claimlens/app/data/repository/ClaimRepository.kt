package com.claimlens.app.data.repository

import android.content.Context
import android.util.Log
import androidx.work.*
import com.claimlens.app.data.local.ClaimDao
import com.claimlens.app.data.local.ClaimEntity
import com.claimlens.app.data.model.ClaimStatus
import com.claimlens.app.data.remote.ClaimApiService
import com.claimlens.app.data.remote.NetworkConfig
import com.claimlens.app.worker.SyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File

class ClaimRepository(
    private val claimDao: ClaimDao,
    private val apiService: ClaimApiService,
    private val context: Context
) {
    companion object {
        private const val TAG = "ClaimRepository"
    }

    val allClaims: Flow<List<ClaimEntity>> = claimDao.getAllClaims()

    suspend fun createClaim(description: String, photoPath: String?, audioPath: String?) = withContext(Dispatchers.IO) {
        val claim = ClaimEntity(
            description = description,
            photoPath = photoPath,
            audioPath = audioPath,
            status = ClaimStatus.PENDING_SYNC
        )
        val id = claimDao.insertClaim(claim)
        val savedClaim = claim.copy(id = id)

        Log.d("CLAIMLENS_UPLOAD", "SUBMIT_STARTED localId=$id description='$description'")
        Log.d("CLAIMLENS_UPLOAD", "CLAIM_CREATED localId=$id description='$description'")
        Log.d("CLAIMLENS_UPLOAD", "STATUS_PENDING_SYNC localId=$id")

        val success = uploadClaim(savedClaim)
        if (!success) {
            scheduleSync()
        }
    }

    private fun scheduleSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            "ClaimSync",
            ExistingWorkPolicy.REPLACE,
            syncRequest
        )
    }

    suspend fun uploadClaim(claim: ClaimEntity): Boolean = withContext(Dispatchers.IO) {
        val claimTag = "claimId=${claim.claimId ?: "local#${claim.id}"}"
        try {
            Log.d("CLAIMLENS_UPLOAD", "STATUS_UPLOADING [$claimTag]")
            claimDao.updateClaim(claim.copy(status = ClaimStatus.UPLOADING))

            val textPart = claim.description.toRequestBody("text/plain".toMediaTypeOrNull())
            val idPart = claim.claimId?.toRequestBody("text/plain".toMediaTypeOrNull())

            val imagePart = claim.photoPath?.let { path ->
                val file = File(path)
                if (file.exists() && file.length() > 0) {
                    val requestFile = file.asRequestBody("image/jpeg".toMediaTypeOrNull())
                    MultipartBody.Part.createFormData("image", file.name, requestFile)
                } else null
            }

            val audioPart = claim.audioPath?.let { path ->
                val file = File(path)
                if (file.exists() && file.length() > 0) {
                    val requestFile = file.asRequestBody("audio/mp4".toMediaTypeOrNull())
                    MultipartBody.Part.createFormData("audio", file.name, requestFile)
                } else null
            }

            Log.d("CLAIMLENS_UPLOAD", "HTTP_REQUEST_STARTED [$claimTag] url=${NetworkConfig.BASE_URL}claims (hasImage=${imagePart != null}, hasAudio=${audioPart != null})")

            val response = apiService.submitClaim(idPart, textPart, imagePart, audioPart)

            Log.d("CLAIMLENS_UPLOAD", "HTTP_RESPONSE_RECEIVED [$claimTag] code=${response.code()}")
            Log.d("CLAIMLENS_UPLOAD", "HTTP_STATUS_CODE [$claimTag] ${response.code()}")

            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                Log.d("CLAIMLENS_UPLOAD", "RESPONSE_BODY [$claimTag] claimId=${body.claimId}, status=${body.status}, conflictDetected=${body.conflictDetected}, message=${body.message}")

                val resultStatus = when (body.status?.uppercase()) {
                    "CONFLICT_DETECTED" -> ClaimStatus.CONFLICT_DETECTED
                    "CLEAR", "NO_CONFLICT" -> ClaimStatus.NO_CONFLICT
                    "PROCESSING" -> ClaimStatus.PROCESSING
                    "AI_FAILED" -> ClaimStatus.ERROR
                    "INSUFFICIENT_EVIDENCE" -> ClaimStatus.NO_CONFLICT
                    else -> if (body.conflictDetected) ClaimStatus.CONFLICT_DETECTED else ClaimStatus.NO_CONFLICT
                }
                val explanation = body.conflictResult
                    ?: body.conflict?.explanation
                    ?: if (resultStatus == ClaimStatus.CONFLICT_DETECTED) {
                        body.message ?: "Conflict detected between photo and voice evidence."
                    } else {
                        body.message ?: "Claim processed successfully."
                    }

                Log.d("CLAIMLENS_UPLOAD", "ROOM_UPDATE_STARTED [$claimTag] targetStatus=$resultStatus")
                claimDao.updateClaim(
                    claim.copy(
                        claimId = body.claimId,
                        status = resultStatus,
                        conflictResult = explanation
                    )
                )
                Log.d("CLAIMLENS_UPLOAD", "ROOM_UPDATE_COMPLETED [$claimTag] finalStatus=$resultStatus")
                Log.d("CLAIMLENS_UPLOAD", "FINAL_STATUS [$claimTag] status=$resultStatus explanation='$explanation'")
                return@withContext true
            } else {
                val errBody = response.errorBody()?.string() ?: "Empty error body"
                Log.e("CLAIMLENS_UPLOAD", "RESPONSE_BODY_ERROR [$claimTag] code=${response.code()} body=$errBody")
                Log.d("CLAIMLENS_UPLOAD", "ROOM_UPDATE_STARTED [$claimTag] targetStatus=ERROR")
                claimDao.updateClaim(
                    claim.copy(
                        status = ClaimStatus.ERROR,
                        conflictResult = "Server error ${response.code()}: $errBody"
                    )
                )
                Log.d("CLAIMLENS_UPLOAD", "ROOM_UPDATE_COMPLETED [$claimTag] finalStatus=ERROR")
                Log.d("CLAIMLENS_UPLOAD", "FINAL_STATUS [$claimTag] status=ERROR")
                return@withContext false
            }
        } catch (e: java.io.IOException) {
            Log.e("CLAIMLENS_UPLOAD", "IOException [$claimTag] ${e.message}", e)
            Log.d("CLAIMLENS_UPLOAD", "ROOM_UPDATE_STARTED [$claimTag] targetStatus=ERROR")
            claimDao.updateClaim(claim.copy(status = ClaimStatus.ERROR, conflictResult = "Network error: ${e.message}"))
            Log.d("CLAIMLENS_UPLOAD", "ROOM_UPDATE_COMPLETED [$claimTag] finalStatus=ERROR")
            Log.d("CLAIMLENS_UPLOAD", "FINAL_STATUS [$claimTag] status=ERROR")
            return@withContext false
        } catch (e: retrofit2.HttpException) {
            Log.e("CLAIMLENS_UPLOAD", "HttpException [$claimTag] code=${e.code()} message=${e.message}", e)
            Log.d("CLAIMLENS_UPLOAD", "ROOM_UPDATE_STARTED [$claimTag] targetStatus=ERROR")
            claimDao.updateClaim(claim.copy(status = ClaimStatus.ERROR, conflictResult = "HTTP error ${e.code()}: ${e.message}"))
            Log.d("CLAIMLENS_UPLOAD", "ROOM_UPDATE_COMPLETED [$claimTag] finalStatus=ERROR")
            Log.d("CLAIMLENS_UPLOAD", "FINAL_STATUS [$claimTag] status=ERROR")
            return@withContext false
        } catch (e: Exception) {
            Log.e("CLAIMLENS_UPLOAD", "Exception [$claimTag] ${e.javaClass.simpleName}: ${e.message}", e)
            Log.d("CLAIMLENS_UPLOAD", "ROOM_UPDATE_STARTED [$claimTag] targetStatus=ERROR")
            claimDao.updateClaim(claim.copy(status = ClaimStatus.ERROR, conflictResult = "Error: ${e.localizedMessage ?: e.message}"))
            Log.d("CLAIMLENS_UPLOAD", "ROOM_UPDATE_COMPLETED [$claimTag] finalStatus=ERROR")
            Log.d("CLAIMLENS_UPLOAD", "FINAL_STATUS [$claimTag] status=ERROR")
            return@withContext false
        }
    }

    suspend fun getPendingClaims(): List<ClaimEntity> {
        return claimDao.getPendingClaims()
    }

    suspend fun clearStuckClaims() {
        claimDao.clearStuckClaims()
    }
}
