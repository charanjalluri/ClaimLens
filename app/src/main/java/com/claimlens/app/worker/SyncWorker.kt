package com.claimlens.app.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.claimlens.app.data.local.AppDatabase
import com.claimlens.app.data.remote.NetworkConfig
import com.claimlens.app.data.repository.ClaimRepository

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    companion object {
        private const val TAG = "SyncWorker"
    }

    override suspend fun doWork(): Result {
        Log.d(TAG, "SyncWorker triggered by WorkManager")
        val database = AppDatabase.getDatabase(applicationContext)
        val apiService = NetworkConfig.createApiService()
        val repository = ClaimRepository(database.claimDao(), apiService, applicationContext)

        val pendingClaims = repository.getPendingClaims()
        Log.d(TAG, "Found ${pendingClaims.size} pending claims to sync")

        var allSuccessful = true
        for (claim in pendingClaims) {
            val success = repository.uploadClaim(claim)
            if (!success) allSuccessful = false
        }

        return if (allSuccessful) {
            Log.d(TAG, "SyncWorker finished all claims successfully")
            Result.success()
        } else {
            Log.w(TAG, "SyncWorker encountered failures, retrying later")
            Result.retry()
        }
    }
}
