package com.claimlens.app.data.remote

import com.google.gson.annotations.SerializedName

data class ConflictDetail(
    @SerializedName("id") val id: String? = null,
    @SerializedName("claimId") val claimId: String? = null,
    @SerializedName("conflictType") val conflictType: String? = null,
    @SerializedName("evidenceA") val evidenceA: String? = null,
    @SerializedName("evidenceB") val evidenceB: String? = null,
    @SerializedName("explanation") val explanation: String? = null,
    @SerializedName("confidence") val confidence: Double? = null,
    @SerializedName("status") val status: String? = null
)

data class ClaimResponse(
    @SerializedName("claimId") val claimId: String,
    @SerializedName("status") val status: String? = null,
    @SerializedName("conflictResult") val conflictResult: String? = null,
    @SerializedName("conflictDetected") val conflictDetected: Boolean = false,
    @SerializedName("conflictCount") val conflictCount: Int = 0,
    @SerializedName("message") val message: String? = null,
    @SerializedName("transcription") val transcription: String? = null,
    @SerializedName("imageAnalysis") val imageAnalysis: String? = null,
    @SerializedName("conflict") val conflict: ConflictDetail? = null
)
