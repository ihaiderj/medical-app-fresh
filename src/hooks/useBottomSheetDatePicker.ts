/**
 * Hook for Bottom Sheet Date Picker
 * Provides easy-to-use interface for date/time selection
 */
import { useState, useCallback } from 'react';

export interface DatePickerConfig {
  mode: 'date' | 'time' | 'datetime';
  title?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}

export interface DatePickerResult {
  date: Date | null;
  cancelled: boolean;
}

export const useBottomSheetDatePicker = () => {
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState(new Date())
  const [config, setConfig] = useState<DatePickerConfig>({ mode: 'date' })
  const [onConfirmCallback, setOnConfirmCallback] = useState<((result: DatePickerResult) => void) | null>(null)

  const showPicker = useCallback((
    initialDate: Date = new Date(),
    pickerConfig: DatePickerConfig = { mode: 'date' },
    onConfirm?: (result: DatePickerResult) => void
  ) => {
    setValue(initialDate)
    setConfig(pickerConfig)
    setOnConfirmCallback(() => onConfirm || null)
    setVisible(true)
  }, [])

  const hidePicker = useCallback(() => {
    setVisible(false)
  }, [])

  const showDate = useCallback((initialDate?: Date, pickerConfig?: Partial<DatePickerConfig>, onConfirm?: (result: DatePickerResult) => void) => {
    showPicker(initialDate, { mode: 'date', ...(pickerConfig || {}) }, onConfirm)
  }, [showPicker])

  const showTime = useCallback((initialDate?: Date, pickerConfig?: Partial<DatePickerConfig>, onConfirm?: (result: DatePickerResult) => void) => {
    showPicker(initialDate, { mode: 'time', ...(pickerConfig || {}) }, onConfirm)
  }, [showPicker])

  const handleConfirm = useCallback((result: DatePickerResult) => {
    // The component already passes a DatePickerResult object
    if (onConfirmCallback) {
      onConfirmCallback(result)
    }
    
    hidePicker()
  }, [onConfirmCallback, hidePicker])

  const handleCancel = useCallback(() => {
    const result: DatePickerResult = {
      date: null,
      cancelled: true,
    }
    
    if (onConfirmCallback) {
      onConfirmCallback(result)
    }
    
    hidePicker()
  }, [onConfirmCallback, hidePicker])

  return {
    visible,
    value,
    config,
    showDate,
    showTime,
    hidePicker,
    handleConfirm,
    handleCancel,
  }
}
