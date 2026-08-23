package com.claimlens.app.data.local

import androidx.room.TypeConverter
import com.claimlens.app.data.model.ClaimStatus

class Converters {
    @TypeConverter
    fun fromStatus(status: ClaimStatus): String = status.name

    @TypeConverter
    fun toStatus(value: String): ClaimStatus = ClaimStatus.valueOf(value)
}
