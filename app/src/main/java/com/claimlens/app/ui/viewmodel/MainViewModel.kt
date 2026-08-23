package com.claimlens.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.claimlens.app.data.local.ClaimEntity
import com.claimlens.app.data.repository.ClaimRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ClaimUiState(
    val description: String = "",
    val photoPath: String? = null,
    val audioPath: String? = null,
    val isRecording: Boolean = false,
    val isCameraOpen: Boolean = false,
    val claims: List<ClaimEntity> = emptyList()
)

class MainViewModel(private val repository: ClaimRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(ClaimUiState())
    val uiState: StateFlow<ClaimUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.allClaims.collect { claims ->
                _uiState.value = _uiState.value.copy(claims = claims)
            }
        }
    }

    fun onDescriptionChange(description: String) {
        _uiState.value = _uiState.value.copy(description = description)
    }

    fun onPhotoCaptured(path: String) {
        _uiState.value = _uiState.value.copy(photoPath = path, isCameraOpen = false)
    }

    fun onAudioRecorded(path: String) {
        _uiState.value = _uiState.value.copy(audioPath = path, isRecording = false)
    }

    fun setRecording(isRecording: Boolean) {
        _uiState.value = _uiState.value.copy(isRecording = isRecording)
    }

    fun setCameraOpen(isOpen: Boolean) {
        _uiState.value = _uiState.value.copy(isCameraOpen = isOpen)
    }

    fun submitClaim() {
        val currentState = _uiState.value
        viewModelScope.launch {
            repository.createClaim(
                description = currentState.description,
                photoPath = currentState.photoPath,
                audioPath = currentState.audioPath
            )
            // Clear current draft
            _uiState.value = _uiState.value.copy(
                description = "",
                photoPath = null,
                audioPath = null
            )
        }
    }
}
