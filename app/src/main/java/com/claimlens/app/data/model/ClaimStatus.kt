package com.claimlens.app.data.model

enum class ClaimStatus {
    DRAFT,
    PENDING_SYNC,
    UPLOADING,
    PROCESSING,
    CONFLICT_DETECTED,
    NO_CONFLICT,
    ERROR,
    RESOLVED
}
