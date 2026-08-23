package com.claimlens.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.claimlens.app.data.model.ClaimStatus

@Entity(tableName = "claims")
data class ClaimEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val claimId: String? = null,
    val description: String,
    val photoPath: String?,
    val audioPath: String?,
    val status: ClaimStatus,
    val conflictResult: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)
