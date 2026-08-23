package com.claimlens.app.data.repository

import android.content.Context
import androidx.work.*
import com.claimlens.app.data.local.ClaimDao
import com.claimlens.app.data.local.ClaimEntity
import com.claimlens.app.data.model.ClaimStatus
import com.claimlens.app.data.remote.ClaimApiService
import com.claimlens.app.worker.SyncWorker
import kotlinx.coroutines.flow.Flow
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
    val allClaims: Flow<List<ClaimEntity>> = claimDao.getAllClaims()

    suspend fun createClaim(description: String, photoPath: String?, audioPath: String?) {
        val claim = ClaimEntity(
            description = description,
            photoPath = photoPath,
            audioPath = audioPath,
            status = ClaimStatus.PENDING_SYNC
        )
        claimDao.insertClaim(claim)
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
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            syncRequest
        )
    }

    suspend fun uploadClaim(claim: ClaimEntity): Boolean {
        try {
            claimDao.updateClaim(claim.copy(status = ClaimStatus.UPLOADING))

            val textPart = claim.description.toRequestBody("text/plain".toMediaTypeOrNull())
            val idPart = claim.claimId?.toRequestBody("text/plain".toMediaTypeOrNull())

            val imagePart = claim.photoPath?.let { path ->
                val file = File(path)
                if (file.exists()) {
                    val requestFile = file.asRequestBody("image/*".toMediaTypeOrNull())
                    MultipartBody.Part.createFormData("image", file.name, requestFile)
                } else null
            }

            val audioPart = claim.audioPath?.let { path ->
                val file = File(path)
                if (file.exists()) {
                    val requestFile = file.asRequestBody("audio/*".toMediaTypeOrNull())
                    MultipartBody.Part.createFormData("audio", file.name, requestFile)
                } else null
            }

            val response = apiService.submitClaim(idPart, textPart, imagePart, audioPart)

            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
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
                return true
            } else {
                claimDao.updateClaim(claim.copy(status = ClaimStatus.ERROR))
                return false
            }
        } catch (e: Exception) {
            claimDao.updateClaim(claim.copy(status = ClaimStatus.ERROR))
            return false
        }
    }

    suspend fun getPendingClaims(): List<ClaimEntity> {
        return claimDao.getClaimsByStatus(ClaimStatus.PENDING_SYNC)
    }
}
