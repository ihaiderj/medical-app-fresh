/**
 * Bottom Sheet Date Picker Component
 * iOS-optimized date picker with smooth animations
 * Replaces DateTimePicker for better iOS UX
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';

interface BottomSheetDatePickerProps {
  visible: boolean
  value: Date
  mode: 'date' | 'time'
  onConfirm: (result: DatePickerResult) => void
  onCancel: () => void
  title?: string
  minimumDate?: Date
  maximumDate?: Date
}

const { height: screenHeight } = Dimensions.get('window');

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isAndroid = Platform.OS === 'android';

export default function BottomSheetDatePicker({
  visible,
  value,
  mode,
  onConfirm,
  onCancel,
  title,
  minimumDate,
  maximumDate,
}: BottomSheetDatePickerProps) {
  const [selectedDate, setSelectedDate] = useState(value)
  const [slideAnim] = useState(new Animated.Value(screenHeight));
  const [backdropAnim] = useState(new Animated.Value(0));

  const clampDate = useCallback((input: Date) => {
    let clamped = new Date(input.getTime());
    if (minimumDate && clamped < minimumDate) {
      clamped = new Date(minimumDate.getTime());
    }
    if (maximumDate && clamped > maximumDate) {
      clamped = new Date(maximumDate.getTime());
    }
    return clamped;
  }, [minimumDate, maximumDate]);

  const years = useMemo(() => {
    const currentYear = selectedDate.getFullYear();
    const minYear = minimumDate ? minimumDate.getFullYear() : currentYear - 50;
    const maxYear = maximumDate ? maximumDate.getFullYear() : currentYear + 50;
    const yearList: number[] = [];
    for (let year = minYear; year <= maxYear; year += 1) {
      yearList.push(year);
    }
    return yearList;
  }, [minimumDate, maximumDate, selectedDate]);

  const daysInMonth = useMemo(() => {
    return new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
  }, [selectedDate]);

  const dayOptions = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, index) => index + 1);
  }, [daysInMonth]);

  const hourOptions = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
  const minuteOptions = useMemo(() => Array.from({ length: 60 }, (_, index) => index), []);

  useEffect(() => {
    if (visible) {
      setSelectedDate(clampDate(value))
      showModal()
    } else {
      hideModal()
    }
  }, [visible, value, clampDate])

  const updateDatePart = useCallback((part: 'year' | 'month' | 'day' | 'hour' | 'minute', value: number) => {
    let updated = new Date(selectedDate.getTime());

    if (part === 'year') {
      updated.setFullYear(value);
    } else if (part === 'month') {
      updated.setMonth(value);
    } else if (part === 'day') {
      updated.setDate(value);
    } else if (part === 'hour') {
      updated.setHours(value);
    } else if (part === 'minute') {
      updated.setMinutes(value);
    }

    const maxDay = new Date(updated.getFullYear(), updated.getMonth() + 1, 0).getDate();
    if (updated.getDate() > maxDay) {
      updated.setDate(maxDay);
    }

    updated = clampDate(updated);
    setSelectedDate(updated);
  }, [selectedDate, clampDate]);

  const padNumber = useCallback((value: number) => value.toString().padStart(2, '0'), []);

  const renderAndroidDatePicker = () => (
    <View style={styles.androidPickerRow}>
      <Picker
        style={styles.androidPicker}
        selectedValue={selectedDate.getDate()}
        onValueChange={(day: number) => updateDatePart('day', day)}
      >
        {dayOptions.map((day) => (
          <Picker.Item key={`day-${day}`} label={day.toString()} value={day} />
        ))}
      </Picker>

      <Picker
        style={styles.androidPicker}
        selectedValue={selectedDate.getMonth()}
        onValueChange={(month: number) => updateDatePart('month', month)}
      >
        {monthLabels.map((label, index) => (
          <Picker.Item key={`month-${index}`} label={label} value={index} />
        ))}
      </Picker>

      <Picker
        style={styles.androidPicker}
        selectedValue={selectedDate.getFullYear()}
        onValueChange={(year: number) => updateDatePart('year', year)}
      >
        {years.map((year) => (
          <Picker.Item key={`year-${year}`} label={year.toString()} value={year} />
        ))}
      </Picker>
    </View>
  );

  const renderAndroidTimePicker = () => (
    <View style={styles.androidPickerRow}>
      <Picker
        style={styles.androidPicker}
        selectedValue={selectedDate.getHours()}
        onValueChange={(hour: number) => updateDatePart('hour', hour)}
      >
        {hourOptions.map((hour) => (
          <Picker.Item key={`hour-${hour}`} label={padNumber(hour)} value={hour} />
        ))}
      </Picker>

      <Picker
        style={styles.androidPicker}
        selectedValue={selectedDate.getMinutes()}
        onValueChange={(minute: number) => updateDatePart('minute', minute)}
      >
        {minuteOptions.map((minute) => (
          <Picker.Item key={`minute-${minute}`} label={padNumber(minute)} value={minute} />
        ))}
      </Picker>
    </View>
  );

  const showModal = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hideModal = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: screenHeight,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleConfirm = () => {
    onConfirm({ date: selectedDate, cancelled: false })
  };

  const handleCancel = () => {
    onCancel()
  }

  const handleDateChange = (event: any, date?: Date) => {
    if (date) {
      setSelectedDate(date);
    }
  };

  const getTitle = () => {
    if (title) return title
    switch (mode) {
      case 'date':
        return 'Select Date'
      case 'time':
        return 'Select Time'
      default:
        return 'Select'
    }
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleCancel}
    >
      <View style={styles.container}>
        {/* Backdrop */}
        <Animated.View 
          style={[
            styles.backdrop,
            { opacity: backdropAnim }
          ]}
        >
          <TouchableOpacity
            style={styles.backdropTouchable}
            activeOpacity={1}
            onPress={handleCancel}
          />
        </Animated.View>

        {/* Bottom Sheet */}
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            
            <Text style={styles.title}>{getTitle()}</Text>
            
            <TouchableOpacity onPress={handleConfirm} style={styles.confirmButton}>
              <Text style={styles.confirmText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Selected Value Display */}
          <View style={styles.selectedValueContainer}>
            <Text style={styles.selectedValueLabel}>Selected:</Text>
            <Text style={styles.selectedValueText}>
              {mode === 'date' && formatDate(selectedDate)}
              {mode === 'time' && formatTime(selectedDate)}
            </Text>
          </View>

          {/* Date/Time Picker */}
          <View style={styles.pickerContainer}>
            {isAndroid ? (
              mode === 'date' ? renderAndroidDatePicker() : renderAndroidTimePicker()
            ) : (
              <DateTimePicker
                value={selectedDate}
                mode={mode}
                display="spinner"
                onChange={handleDateChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                style={styles.picker}
                textColor="#1f2937"
              />
            )}
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => setSelectedDate(clampDate(new Date()))}
            >
              <Ionicons name="today" size={20} color="#8b5cf6" />
              <Text style={styles.quickActionText}>Now</Text>
            </TouchableOpacity>

            {mode === 'time' && (
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => {
                  const now = new Date()
                  now.setHours(now.getHours() + 1)
                  setSelectedDate(clampDate(now))
                }}
              >
                <Ionicons name="time" size={20} color="#8b5cf6" />
                <Text style={styles.quickActionText}>+1 Hour</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdropTouchable: {
    flex: 1,
  },
  bottomSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: screenHeight * 0.7,
    minHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cancelText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  confirmButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  confirmText: {
    fontSize: 16,
    color: '#8b5cf6',
    fontWeight: '600',
  },
  selectedValueContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  selectedValueLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  selectedValueText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  pickerContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  picker: {
    flex: 1,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    gap: 6,
  },
  quickActionText: {
    fontSize: 14,
    color: '#8b5cf6',
    fontWeight: '500',
  },
  androidPickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  androidPicker: {
    flex: 1,
    color: '#1f2937',
  },
});
