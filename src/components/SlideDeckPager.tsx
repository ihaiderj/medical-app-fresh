import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Image,
  FlatList,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ViewToken,
} from 'react-native'

export interface SlideDeckItem {
  id: string
  imageUri: string
  title?: string
}

interface SlideDeckPagerProps {
  slides: SlideDeckItem[]
  initialIndex?: number
  /**
   * When true, swipe left→right advances to the next slide.
   * Default false = standard gallery (swipe right→left = next).
   */
  advanceOnSwipeRight?: boolean
  onIndexChange?: (index: number) => void
  imageSource?: (uri: string) => { uri: string } | number
  style?: object
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

/**
 * Native paging deck — avoids enter/exit animation races on first/last slides.
 */
export default function SlideDeckPager({
  slides,
  initialIndex = 0,
  advanceOnSwipeRight = false,
  onIndexChange,
  imageSource,
  style,
}: SlideDeckPagerProps) {
  const listRef = useRef<FlatList<SlideDeckItem>>(null)
  const [pageWidth, setPageWidth] = useState(SCREEN_WIDTH)
  const [pageHeight, setPageHeight] = useState(SCREEN_HEIGHT)
  const lastReportedIndex = useRef(initialIndex)

  // For left→right = next: reverse data so native FlatList paging feels inverted.
  const data = advanceOnSwipeRight ? [...slides].reverse() : slides
  const toListIndex = useCallback(
    (realIndex: number) =>
      advanceOnSwipeRight ? Math.max(0, slides.length - 1 - realIndex) : realIndex,
    [advanceOnSwipeRight, slides.length],
  )
  const toRealIndex = useCallback(
    (listIndex: number) =>
      advanceOnSwipeRight ? Math.max(0, slides.length - 1 - listIndex) : listIndex,
    [advanceOnSwipeRight, slides.length],
  )

  const safeInitial = Math.min(Math.max(0, initialIndex), Math.max(0, slides.length - 1))
  const listInitial = toListIndex(safeInitial)

  useEffect(() => {
    if (safeInitial === lastReportedIndex.current) return
    lastReportedIndex.current = safeInitial
    const listIndex = toListIndex(safeInitial)
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: listIndex, animated: true })
      } catch {
        // initial layout may not be ready
      }
    })
  }, [safeInitial, toListIndex])

  const resolveSource = (uri: string) => {
    if (imageSource) return imageSource(uri)
    if (!uri) return undefined
    const normalized = uri.startsWith('file://') || uri.startsWith('http') ? uri : `file://${uri}`
    return { uri: normalized }
  }

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0 || slides.length === 0) return
    const listIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth)
    const realIndex = toRealIndex(listIndex)
    if (realIndex !== lastReportedIndex.current) {
      lastReportedIndex.current = realIndex
      onIndexChange?.(realIndex)
    }
  }

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0]
      if (first?.index == null) return
      const realIndex = toRealIndex(first.index)
      if (realIndex !== lastReportedIndex.current) {
        lastReportedIndex.current = realIndex
        onIndexChange?.(realIndex)
      }
    },
  ).current

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current

  if (!slides.length) {
    return <View style={[styles.container, style]} />
  }

  return (
    <View
      style={[styles.container, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        if (width > 0) setPageWidth(width)
        if (height > 0) setPageHeight(height)
      }}
    >
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        initialScrollIndex={listInitial}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            try {
              listRef.current?.scrollToIndex({ index: info.index, animated: false })
            } catch {
              // ignore
            }
          }, 50)
        }}
        getItemLayout={(_, index) => ({
          length: pageWidth,
          offset: pageWidth * index,
          index,
        })}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        windowSize={3}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        renderItem={({ item }) => (
          <View style={{ width: pageWidth, height: pageHeight, justifyContent: 'center' }}>
            <Image
              source={resolveSource(item.imageUri) as any}
              style={{ width: pageWidth, height: pageHeight }}
              resizeMode="contain"
            />
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
})
