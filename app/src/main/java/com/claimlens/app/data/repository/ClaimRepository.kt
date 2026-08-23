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
                claimDao.updateClaim(
                    claim.copy(
                        claimId = body.claimId,
                        status = body.status,
                        conflictResult = body.conflictResult
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
