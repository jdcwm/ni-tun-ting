import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, PanResponder, GestureResponderEvent, PanResponderGestureState, LayoutChangeEvent } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface CustomScrollbarProps {
  scrollViewRef: React.RefObject<any>;
  contentHeight: number;
  visibleHeight: number;
  scrollY?: number;
}

const THUMB_WIDTH_NORMAL = 5;
const THUMB_WIDTH_ACTIVE = 12;
const TRACK_WIDTH = 28;

export const CustomScrollbar: React.FC<CustomScrollbarProps> = ({ scrollViewRef, contentHeight, visibleHeight, scrollY = 0 }) => {
  const theme = useTheme();
  const [thumbPosition, setThumbPosition] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const containerRef = useRef<View>(null);
  const containerPageY = useRef(0);
  const dragStartScrollY = useRef(0);
  const scrollYRef = useRef(scrollY);
  scrollYRef.current = scrollY;
  const contentHeightRef = useRef(contentHeight);
  contentHeightRef.current = contentHeight;
  const visibleHeightRef = useRef(visibleHeight);
  visibleHeightRef.current = visibleHeight;

  const thumbHeight = Math.max(60, (visibleHeight / contentHeight) * visibleHeight);
  const maxThumbPos = visibleHeight - thumbHeight;
  const maxThumbPosRef = useRef(maxThumbPos);
  maxThumbPosRef.current = maxThumbPos;

  useEffect(() => {
    if (isActive) return;
    if (contentHeight <= visibleHeight) return;
    const ratio = scrollY / (contentHeight - visibleHeight);
    const pos = ratio * maxThumbPos;
    setThumbPosition(Math.max(0, Math.min(pos, maxThumbPos)));
  }, [scrollY, contentHeight, visibleHeight, maxThumbPos, isActive]);

  // 兼容 FlatList (scrollToOffset) 和 ScrollView (scrollTo)
  const scrollToY = (y: number, animated = false) => {
    const ref = scrollViewRef.current;
    if (!ref) return;
    if (typeof ref.scrollToOffset === 'function') {
      ref.scrollToOffset({ offset: y, animated });
    } else if (typeof ref.scrollTo === 'function') {
      ref.scrollTo({ y, animated });
    } else if (ref.getNode) {
      const node = ref.getNode();
      if (node && typeof node.scrollToOffset === 'function') {
        node.scrollToOffset({ offset: y, animated });
      } else if (node && typeof node.scrollTo === 'function') {
        node.scrollTo({ y, animated });
      }
    }
  };

  const handleLayout = (_e: LayoutChangeEvent) => {
    containerRef.current?.measure((_x, _y, _w, _h, _pageX, pageY) => {
      containerPageY.current = pageY;
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gestureState) => Math.abs(gestureState.dy) > 0,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        setIsActive(true);
        containerRef.current?.measure((_x, _y, _w, _h, _pageX, pageY) => {
          containerPageY.current = pageY;
          const ch = contentHeightRef.current;
          const vh = visibleHeightRef.current;
          const relativeY = evt.nativeEvent.pageY - pageY;
          if (relativeY >= 0 && relativeY <= vh && ch > vh) {
            const ratio = Math.max(0, Math.min(1, relativeY / vh));
            const target = ratio * (ch - vh);
            scrollToY(target, false);
            dragStartScrollY.current = target;
            // 同步更新滑块位置
            const mtp = maxThumbPosRef.current;
            setThumbPosition(Math.max(0, Math.min(ratio * mtp, mtp)));
          } else {
            dragStartScrollY.current = scrollYRef.current;
          }
        });
      },

      onPanResponderMove: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const ch = contentHeightRef.current;
        const vh = visibleHeightRef.current;
        const mtp = maxThumbPosRef.current;
        if (ch <= vh || mtp <= 0) return;
        const startRatio = dragStartScrollY.current / (ch - vh);
        const deltaRatio = gestureState.dy / mtp;
        const newRatio = Math.max(0, Math.min(1, startRatio + deltaRatio));
        const target = newRatio * (ch - vh);
        scrollToY(target, false);
        // 同步更新滑块位置，让滑块跟随手指移动
        const newThumbPos = newRatio * mtp;
        setThumbPosition(Math.max(0, Math.min(newThumbPos, mtp)));
      },

      onPanResponderRelease: () => {
        setTimeout(() => setIsActive(false), 300);
      },

      onPanResponderTerminate: () => {
        setTimeout(() => setIsActive(false), 300);
      },
    })
  ).current;

  if (contentHeight <= visibleHeight) return null;

  const thumbWidth = isActive ? THUMB_WIDTH_ACTIVE : THUMB_WIDTH_NORMAL;

  return (
    <View
      ref={containerRef}
      onLayout={handleLayout}
      style={[styles.container, { height: visibleHeight }]}
      {...panResponder.panHandlers}
    >
      <View
        style={[
          styles.thumb,
          {
            width: thumbWidth,
            height: thumbHeight,
            transform: [{ translateY: thumbPosition }],
            backgroundColor: theme.accentColor,
            opacity: isActive ? 0.9 : 0.4,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: TRACK_WIDTH,
    height: '100%',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    zIndex: 999,
  },
  thumb: {
    marginRight: 3,
    borderRadius: 4,
  },
});
