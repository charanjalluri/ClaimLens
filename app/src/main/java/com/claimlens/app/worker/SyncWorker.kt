package com.claimlens.app.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.claimlens.app.data.local.AppDatabase
import com.claimlens.app.data.remote.ClaimApiService
import com.claimlens.app.data.repository.ClaimRepository
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val database = AppDatabase.getDatabase(applicationContext)
        val apiService = com.claimlens.app.data.remote.NetworkConfig.createApiService()
        val repository = ClaimRepository(database.claimDao(), apiService, applicationContext)

        val pendingClaims = repository.getPendingClaims()

        var allSuccessful = true
        for (claim in pendingClaims) {
            val success = repository.uploadClaim(claim)
            if (!success) allSuccessful = false
        }

        return if (allSuccessful) Result.success() else Result.retry()
    }
}
