import { Dimensions, Platform } from 'react-native'

const { width, height } = Dimensions.get('window')

export const isTablet = () => {
  const aspectRatio = height / width
  // Tablets typically have aspect ratio between 1.2 and 1.6
  // Phones are usually > 1.6
  return (
    (Platform.OS === 'ios' && Platform.isPad) ||
    (width >= 768 && aspectRatio < 1.6)
  )
}

export const isSmallDevice = () => {
  return width < 375 // iPhone SE and smaller
}

export const isLargeDevice = () => {
  return width >= 768 // iPad and larger
}

export const getResponsiveWidth = (percentage: number) => {
  if (isTablet()) {
    // On tablets, limit modal width to 600px max
    return Math.min(width * (percentage / 100), 600)
  }
  return width * (percentage / 100)
}

export const getResponsiveFontSize = (baseSize: number) => {
  if (isSmallDevice()) {
    return baseSize * 0.9 // 10% smaller on small devices
  }
  if (isTablet()) {
    return baseSize * 1.1 // 10% larger on tablets
  }
  return baseSize
}

export const getResponsiveSpacing = (baseSpacing: number) => {
  if (isSmallDevice()) {
    return baseSpacing * 0.8
  }
  if (isTablet()) {
    return baseSpacing * 1.2
  }
  return baseSpacing
}

export const dimensions = {
  width,
  height,
  isTablet: isTablet(),
  isSmallDevice: isSmallDevice(),
  isLargeDevice: isLargeDevice(),
}

// Modal-specific responsive utilities
export const getModalWidth = (percentage: number = 90) => {
  if (isTablet()) {
    // On tablets, use responsive width but cap at reasonable max
    const maxWidth = 700 // Better for tablets than 600
    return Math.min(width * (percentage / 100), maxWidth)
  }
  return width * (percentage / 100)
}

export const getModalMaxHeight = (percentage: number = 80) => {
  if (isTablet()) {
    // On tablets, allow more height
    return height * (Math.min(percentage, 85) / 100)
  }
  return height * (percentage / 100)
}

export const getModalPadding = () => {
  if (isTablet()) {
    return 24 // More padding on tablets
  }
  if (isSmallDevice()) {
    return 16 // Less padding on small devices
  }
  return 20 // Standard padding
}

export const getModalBorderRadius = () => {
  if (isTablet()) {
    return 20 // Larger radius on tablets
  }
  return 16 // Standard radius
}

// Get safe area insets for modals
export const getModalSafeAreaPadding = () => {
  // This will be used with react-native-safe-area-context
  // For now, return platform-specific defaults
  if (Platform.OS === 'ios') {
    return { top: 20, bottom: 20, left: 0, right: 0 }
  }
  return { top: 0, bottom: 0, left: 0, right: 0 }
}



