package com.claimlens.app.data.remote

import com.claimlens.app.data.model.ClaimStatus

data class ClaimResponse(
    val claimId: String,
    val status: ClaimStatus,
    val conflictResult: String?
)
