package com.claimlens.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.claimlens.app.data.local.AppDatabase
import com.claimlens.app.data.remote.ClaimApiService
import com.claimlens.app.data.repository.ClaimRepository
import com.claimlens.app.ui.screens.CaptureScreen
import com.claimlens.app.ui.screens.DashboardScreen
import com.claimlens.app.ui.theme.ClaimLensTheme
import com.claimlens.app.ui.viewmodel.MainViewModel
import com.claimlens.app.ui.viewmodel.ViewModelFactory
import com.claimlens.app.util.AudioRecorder
import com.claimlens.app.util.CameraManager
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize dependencies (Manual DI for Hackathon)
        val database = AppDatabase.getDatabase(applicationContext)
        val retrofit = Retrofit.Builder()
            .baseUrl("https://api.claimlens.com/") // Placeholder
            .addConverterFactory(GsonConverterFactory.create())
            .build()
        val apiService = retrofit.create(ClaimApiService::class.java)
        val repository = ClaimRepository(database.claimDao(), apiService, applicationContext)
        val factory = ViewModelFactory(repository)

        val cameraManager = CameraManager(applicationContext)
        val audioRecorder = AudioRecorder(applicationContext)

        setContent {
            ClaimLensTheme {
                val navController = rememberNavController()
                val viewModel: MainViewModel = viewModel(factory = factory)

                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    NavHost(navController = navController, startDestination = "dashboard") {
                        composable("dashboard") {
                            DashboardScreen(viewModel, navController)
                        }
                        composable("capture") {
                            CaptureScreen(viewModel, navController, cameraManager, audioRecorder)
                        }
                    }
                }
            }
        }
    }
}
