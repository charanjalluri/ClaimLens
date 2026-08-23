package com.claimlens.app.data.local

import androidx.room.*
import com.claimlens.app.data.model.ClaimStatus
import kotlinx.coroutines.flow.Flow

@Dao
interface ClaimDao {
    @Query("SELECT * FROM claims ORDER BY createdAt DESC")
    fun getAllClaims(): Flow<List<ClaimEntity>>

    @Query("SELECT * FROM claims WHERE id = :id")
    suspend fun getClaimById(id: Long): ClaimEntity?

    @Query("SELECT * FROM claims WHERE status = 'PENDING_SYNC' ORDER BY createdAt ASC")
    suspend fun getPendingClaims(): List<ClaimEntity>

    @Query("SELECT * FROM claims WHERE status = :status")
    suspend fun getClaimsByStatus(status: ClaimStatus): List<ClaimEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertClaim(claim: ClaimEntity): Long

    @Update
    suspend fun updateClaim(claim: ClaimEntity)

    @Query("DELETE FROM claims WHERE status IN ('UPLOADING', 'PENDING_SYNC')")
    suspend fun clearStuckClaims()

    @Query("DELETE FROM claims")
    suspend fun clearAllClaims()

    @Delete
    suspend fun deleteClaim(claim: ClaimEntity)
}
