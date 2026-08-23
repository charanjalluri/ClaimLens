package com.claimlens.app.data.remote

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object NetworkConfig {
    /**
     * Configurable Base URL for ClaimLens Backend API.
     * Default for Android Emulator: "http://10.0.2.2:8000/"
     * For physical device: use "http://<PC-LAN-IP>:8000/" (e.g. "http://192.168.1.5:8000/")
     * Note: Cleartext HTTP is enabled in AndroidManifest.xml.
     */
    var BASE_URL: String = "http://10.79.144.59:8000/"

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(loggingInterceptor)
        .connectTimeout(180, TimeUnit.SECONDS)  // AI pipeline can take 60–150s
        .readTimeout(180, TimeUnit.SECONDS)
        .writeTimeout(180, TimeUnit.SECONDS)
        .build()

    fun createApiService(baseUrl: String = BASE_URL): ClaimApiService {
        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
        return retrofit.create(ClaimApiService::class.java)
    }
}
