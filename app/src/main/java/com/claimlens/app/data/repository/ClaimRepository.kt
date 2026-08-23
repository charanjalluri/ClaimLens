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

    suspend fun createClaim(description: String, photoPath: String?, audioPath: String?) {
        val claim = ClaimEntity(
            description = description,
            photoPath = photoPath,
            audioPath = audioPath,
            status = ClaimStatus.PENDING_SYNC
        )
        val id = claimDao.insertClaim(claim)
        val savedClaim = claim.copy(id = id)
        Log.d(TAG, "Created claim in Room with local ID: $id")

        // Trigger immediate coroutine upload in background for responsive UX
        CoroutineScope(Dispatchers.IO).launch {
            uploadClaim(savedClaim)
        }

        // Also schedule WorkManager for persistent offline/retry sync
        scheduleSync()
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

    suspend fun uploadClaim(claim: ClaimEntity): Boolean {
        Log.d(TAG, "Starting upload for claim #${claim.id} ('${claim.description}')")
        try {
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

            Log.d(TAG, "Sending multipart POST to ${NetworkConfig.BASE_URL}claims (hasImage=${imagePart != null}, hasAudio=${audioPart != null})")
            val response = apiService.submitClaim(idPart, textPart, imagePart, audioPart)
            Log.d(TAG, "Server responded with HTTP ${response.code()}")

            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                Log.d(TAG, "Claim received successfully: claimId=${body.claimId}, status=${body.status}, conflictDetected=${body.conflictDetected}")

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

                claimDao.updateClaim(
                    claim.copy(
                        claimId = body.claimId,
                        status = resultStatus,
                        conflictResult = explanation
                    )
                )
                Log.d(TAG, "Claim #${claim.id} updated in Room to status: $resultStatus")
                return true
            } else {
                val errBody = response.errorBody()?.string()
                Log.e(TAG, "Claim #${claim.id} upload failed with HTTP ${response.code()}: $errBody")
                claimDao.updateClaim(claim.copy(status = ClaimStatus.ERROR, conflictResult = "Server error ${response.code()}: $errBody"))
                return false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Upload exception for claim #${claim.id}: ${e.message}", e)
            claimDao.updateClaim(claim.copy(status = ClaimStatus.ERROR, conflictResult = "Connection failed: ${e.localizedMessage ?: e.message}"))
            return false
        }
    }

    suspend fun getPendingClaims(): List<ClaimEntity> {
        return claimDao.getPendingClaims()
    }
}
