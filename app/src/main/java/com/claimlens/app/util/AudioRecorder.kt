package com.claimlens.app.util

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import java.io.File
import java.io.FileOutputStream

class AudioRecorder(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var audioFile: File? = null

    fun start(outputFile: File) {
        audioFile = outputFile
        createRecorder().apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setOutputFile(FileOutputStream(outputFile).fd)

            prepare()
            start()
        }
    }

    fun stop(): String? {
        recorder?.apply {
            stop()
            release()
        }
        recorder = null
        return audioFile?.absolutePath
    }

    private fun createRecorder(): MediaRecorder {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context).also { recorder = it }
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder().also { recorder = it }
        }
    }
}
