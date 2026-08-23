package com.claimlens.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.navigation.NavController
import com.claimlens.app.data.local.ClaimEntity
import com.claimlens.app.data.model.ClaimStatus
import com.claimlens.app.ui.viewmodel.MainViewModel
import com.claimlens.app.util.AudioRecorder
import com.claimlens.app.util.CameraManager
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(viewModel: MainViewModel, navController: NavController) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("ClaimLens") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = { navController.navigate("capture") }) {
                Icon(Icons.Default.Add, contentDescription = "Create Claim")
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            items(state.claims) { claim ->
                ClaimItem(claim)
            }
        }
    }
}

@Composable
fun ClaimItem(claim: ClaimEntity) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = "Status: ${claim.status}", style = MaterialTheme.typography.titleMedium)
            Text(text = claim.description)
            if (claim.conflictResult != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val icon = if (claim.status == ClaimStatus.CONFLICT_DETECTED) Icons.Default.Warning else Icons.Default.Check
                    val tint = if (claim.status == ClaimStatus.CONFLICT_DETECTED) Color.Red else Color.Green
                    Icon(icon, contentDescription = null, tint = tint)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(text = claim.conflictResult, color = tint)
                }
            }
        }
    }
}

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun CaptureScreen(
    viewModel: MainViewModel,
    navController: NavController,
    cameraManager: CameraManager,
    audioRecorder: AudioRecorder
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val cameraPermissionState = rememberPermissionState(android.Manifest.permission.CAMERA)
    val audioPermissionState = rememberPermissionState(android.Manifest.permission.RECORD_AUDIO)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(text = "New Claim", style = MaterialTheme.typography.headlineMedium)

        OutlinedTextField(
            value = state.description,
            onValueChange = { viewModel.onDescriptionChange(it) },
            label = { Text("Description") },
            modifier = Modifier.fillMaxWidth()
        )

        if (state.isCameraOpen) {
            if (cameraPermissionState.status.isGranted) {
                Box(modifier = Modifier.height(300.dp).fillMaxWidth()) {
                    AndroidView(
                        factory = { ctx ->
                            androidx.camera.view.PreviewView(ctx).apply {
                                cameraManager.startCamera(lifecycleOwner, this) {}
                            }
                        },
                        modifier = Modifier.fillMaxSize()
                    )
                    Button(
                        onClick = {
                            cameraManager.takePhoto(
                                onPhotoCaptured = { viewModel.onPhotoCaptured(it) },
                                onError = {}
                            )
                        },
                        modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 16.dp)
                    ) {
                        Text("Capture")
                    }
                }
            } else {
                Button(onClick = { cameraPermissionState.launchPermissionRequest() }) {
                    Text("Grant Camera Permission")
                }
            }
        } else {
            Button(onClick = { viewModel.setCameraOpen(true) }) {
                Text(if (state.photoPath == null) "Open Camera" else "Change Photo")
            }
            if (state.photoPath != null) {
                Text("Photo: ${File(state.photoPath!!).name}", color = Color.Gray)
            }
        }

        if (state.isRecording) {
            Button(onClick = {
                val path = audioRecorder.stop()
                if (path != null) viewModel.onAudioRecorded(path)
            }) {
                Text("Stop Recording")
            }
        } else {
            if (audioPermissionState.status.isGranted) {
                Button(onClick = {
                    val file = File(context.filesDir, "audio_${System.currentTimeMillis()}.mp4")
                    audioRecorder.start(file)
                    viewModel.setRecording(true)
                }) {
                    Text(if (state.audioPath == null) "Start Voice Recording" else "Re-record Voice")
                }
            } else {
                Button(onClick = { audioPermissionState.launchPermissionRequest() }) {
                    Text("Grant Audio Permission")
                }
            }
            if (state.audioPath != null) {
                Text("Audio: ${File(state.audioPath!!).name}", color = Color.Gray)
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        Button(
            onClick = {
                viewModel.submitClaim()
                navController.popBackStack()
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = state.description.isNotBlank()
        ) {
            Text("Submit Claim")
        }
    }
}
