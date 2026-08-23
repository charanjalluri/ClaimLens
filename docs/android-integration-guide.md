# ClaimLens — Android Integration Guide

> **Target Audience:** Palukuri Kaushik (Android Developer)  
> **Author:** Gayathri Sai Vemula (Backend + Database Developer)  
> **Backend Version:** 1.0.0  
> **Last Updated:** 2026-08-23  

---

## 1. Base API URL & Networking

During development and testing with an Android Emulator or physical device:

| Environment | Base URL |
|---|---|
| **Android Emulator** | `http://10.0.2.2:8000` |
| **Local WiFi / Physical Device** | `http://<your-computer-ip>:8000` (e.g. `http://192.168.1.100:8000`) |
| **Production / Cloud** | `https://claimlens-backend.example.com` |

---

## 2. Claim Submission API

Submit insurance claims containing claimant typed text, damage photo, and voice memo recording.

### Endpoint
```http
POST /api/v1/claims
Host: http://10.0.2.2:8000
Content-Type: multipart/form-data
```
*(Note: `/claims` is also supported as a direct root alias)*

### Request Parameters (Multipart Form)

| Field Name | Type | Required | Description |
|---|---|---|---|
| `claim_text` (or `text`) | `String` / `RequestBody` | **Yes** | Text description typed by claimant (e.g., "My front bumper is damaged.") |
| `claim_id` (or `claimId`) | `String` / `RequestBody` | No | Optional. If omitted, backend generates a unique ID (e.g. `CLM-4821`). |
| `user_id` (or `userId`) | `String` / `RequestBody` | No | Authenticated user ID (e.g. `user-101`). |
| `image` | `File` / `MultipartBody.Part` | No | Photo of vehicle/property damage (`image/jpeg` or `image/png`). |
| `audio` | `File` / `MultipartBody.Part` | No | Voice recording (`audio/mpeg`, `audio/wav`, `audio/m4a`, `audio/ogg`). |

---

## 3. Response Format

### Success Response (`201 Created`)

#### Scenario A: Conflict Detected (Contradiction between photo, voice, or text)
```json
{
  "claimId": "CLM-001",
  "status": "CONFLICT_DETECTED",
  "conflictDetected": true,
  "conflictCount": 1,
  "message": "Claim received. AI detected contradictions between evidence sources.",
  "transcription": "My windshield was completely broken.",
  "imageAnalysis": "Front bumper shows significant impact damage with paint scraping.",
  "processingTimeMs": 3200,
  "conflict": {
    "conflictId": "CONF-CLM-001-492",
    "claimId": "CLM-001",
    "conflictType": "damage_location",
    "evidenceA": "Photo shows front bumper damage",
    "evidenceB": "Voice states windshield is broken",
    "explanation": "The visual and voice evidence describe different damaged components. The photo clearly shows front bumper impact damage while the voice recording describes a broken windshield.",
    "confidence": 0.91,
    "status": "unresolved"
  },
  "claim": {
    "claimId": "CLM-001",
    "userId": "user-101",
    "text": "My front bumper is damaged.",
    "imageUrl": "/uploads/images/img_1724400000_abc123.jpg",
    "audioUrl": "/uploads/audio/aud_1724400000_def456.mp3",
    "status": "CONFLICT_DETECTED",
    "conflictCount": 1,
    "createdAt": "2026-08-23T05:30:00.000Z"
  }
}
```

#### Scenario B: Consistent / Clear Claim (No Contradiction)
```json
{
  "claimId": "CLM-002",
  "status": "CLEAR",
  "conflictDetected": false,
  "conflictCount": 0,
  "message": "Claim received. AI analysis completed without conflicts.",
  "transcription": "The front bumper was hit while parked.",
  "imageAnalysis": "Front bumper shows visible dent.",
  "processingTimeMs": 2800,
  "conflict": null,
  "claim": {
    "claimId": "CLM-002",
    "status": "CLEAR",
    "conflictCount": 0
  }
}
```

---

## 4. Claim Status Values

| Status Value | Meaning | Recommended Android UI Display |
|---|---|---|
| `PROCESSING` | Claim is currently being analyzed by AI pipeline | Display loading / pulsing badge ⏳ |
| `CLEAR` | All evidence is consistent, no fraud/conflicts found | Display green "Clear" badge 🛡️ |
| `CONFLICT_DETECTED` | Contradiction detected between evidence streams | Display amber/red "Under Review" banner ⚠️ |
| `UNRESOLVED` | Conflict is awaiting adjuster review | Display review status tag 🔍 |
| `RESOLVED` | Claims adjuster reviewed and resolved the conflict | Display blue/green "Resolved" checkmark ✅ |
| `INSUFFICIENT_EVIDENCE` | Insufficient evidence submitted for cross-check | Prompt user to attach photo/voice memo ℹ️ |
| `AI_FAILED` | AI service temporary timeout / fallback applied | Display processed status ℹ️ |

---

## 5. Conflict Types

| Conflict Type | Description |
|---|---|
| `damage_location` | Different components described (e.g. bumper vs windshield) |
| `damage_severity` | Severity mismatch (minor scratch vs totaled) |
| `incident_type` | Inconsistent incident description |
| `no_damage_visible` | Text/voice claims damage, but photo shows clean vehicle |
| `none` | No conflict detected |

---

## 6. Error Response Format

### Validation Error (`400 Bad Request`)
```json
{
  "error": "Validation Error",
  "message": "Field \"claim_text\" or \"text\" is required.",
  "statusCode": 400
}
```

### Claim Not Found (`404 Not Found`)
```json
{
  "error": "NotFound",
  "message": "Claim with ID \"CLM-999\" not found.",
  "statusCode": 404
}
```

---

## 7. Android Kotlin Retrofit 2 Implementation Example

### Retrofit Interface
```kotlin
package com.claimlens.app.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

interface ClaimLensApiService {

    @Multipart
    @POST("api/v1/claims")
    suspend fun submitClaim(
        @Part("claim_text") claimText: RequestBody,
        @Part("claim_id") claimId: RequestBody? = null,
        @Part("user_id") userId: RequestBody? = null,
        @Part image: MultipartBody.Part? = null,
        @Part audio: MultipartBody.Part? = null
    ): Response<ClaimSubmissionResponse>

    @GET("api/v1/claims/{id}")
    suspend fun getClaimDetails(
        @Path("id") claimId: String
    ): Response<ClaimDetailResponse>

    @GET("api/v1/claims/{id}/conflicts")
    suspend fun getClaimConflicts(
        @Path("id") claimId: String
    ): Response<ClaimConflictsResponse>
}
```

### Data Models (Kotlin)
```kotlin
package com.claimlens.app.data.model

import com.google.gson.annotations.SerializedName

data class ClaimSubmissionResponse(
    @SerializedName("claimId") val claimId: String,
    @SerializedName("status") val status: String,
    @SerializedName("conflictDetected") val conflictDetected: Boolean,
    @SerializedName("conflictCount") val conflictCount: Int,
    @SerializedName("message") val message: String?,
    @SerializedName("transcription") val transcription: String?,
    @SerializedName("imageAnalysis") val imageAnalysis: String?,
    @SerializedName("conflict") val conflict: ConflictInfo?,
    @SerializedName("claim") val claim: ClaimData?
)

data class ConflictInfo(
    @SerializedName("conflictId") val conflictId: String,
    @SerializedName("claimId") val claimId: String,
    @SerializedName("conflictType") val conflictType: String,
    @SerializedName("evidenceA") val evidenceA: String?,
    @SerializedName("evidenceB") val evidenceB: String?,
    @SerializedName("explanation") val explanation: String?,
    @SerializedName("confidence") val confidence: Float,
    @SerializedName("status") val status: String
)

data class ClaimData(
    @SerializedName("claimId") val claimId: String,
    @SerializedName("userId") val userId: String?,
    @SerializedName("text") val text: String,
    @SerializedName("imageUrl") val imageUrl: String?,
    @SerializedName("audioUrl") val audioUrl: String?,
    @SerializedName("status") val status: String,
    @SerializedName("conflictCount") val conflictCount: Int,
    @SerializedName("createdAt") val createdAt: String?
)
```

### Submitting a Claim in Kotlin Repository / ViewModel
```kotlin
suspend fun sendClaimToBackend(
    text: String,
    imageFile: File?,
    audioFile: File?,
    userId: String = "user-101"
): Result<ClaimSubmissionResponse> {
    return try {
        val textBody = text.toRequestBody("text/plain".toMediaTypeOrNull())
        val userBody = userId.toRequestBody("text/plain".toMediaTypeOrNull())

        val imagePart = imageFile?.let {
            val reqFile = it.asRequestBody("image/jpeg".toMediaTypeOrNull())
            MultipartBody.Part.createFormData("image", it.name, reqFile)
        }

        val audioPart = audioFile?.let {
            val reqFile = it.asRequestBody("audio/mpeg".toMediaTypeOrNull())
            MultipartBody.Part.createFormData("audio", it.name, reqFile)
        }

        val response = apiService.submitClaim(
            claimText = textBody,
            userId = userBody,
            image = imagePart,
            audio = audioPart
        )

        if (response.isSuccessful && response.body() != null) {
            Result.success(response.body()!!)
        } else {
            Result.failure(Exception("Submission failed with code: ${response.code()}"))
        }
    } catch (e: Exception) {
        Result.failure(e)
    }
}
```

---

## 8. Health Check Verification

You can verify the backend status anytime from your browser or Android app:
```
GET http://10.0.2.2:8000/health
```
Expected Response:
```json
{
  "status": "healthy",
  "service": "ClaimLens Backend & Database Service",
  "version": "1.0.0",
  "database": {
    "engine": "SQLite",
    "claimsCount": 5
  }
}
```
