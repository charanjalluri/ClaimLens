package com.claimlens.app.data.remote

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part

interface ClaimApiService {
    @Multipart
    @POST("claims")
    suspend fun submitClaim(
        @Part("claimId") claimId: RequestBody?,
        @Part("text") text: RequestBody,
        @Part image: MultipartBody.Part?,
        @Part audio: MultipartBody.Part?
    ): Response<ClaimResponse>
}
