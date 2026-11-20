import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { KIVOTOS_LOCATIONS, KivotosLocation } from '../data/kivotosLocations';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BALL = 52;

interface Props {
  theme: any;
}

/**
 * 可拖动悬浮球：点开是「基沃托斯地点」列表。
 * 地点内容来自 `碧蓝档案角色资料`（学院资料.md / 世界观资料.md），不依赖任何地图图片。
 */
export const FloatingLocationBall: React.FC<Props> = ({ theme }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: SCREEN_WIDTH - BALL - 8, y: SCREEN_HEIGHT * 0.45 });
  const posRef = useRef(pos);
  const startRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = posRef.current;
          movedRef.current = false;
        },
        onPanResponderMove: (_e, g) => {
          if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) movedRef.current = true;
          // 默认只在右半边左右拖动，避免挡住发送按钮；上下可自由拖
          const nx = Math.max(0, Math.min(SCREEN_WIDTH - BALL, startRef.current.x + g.dx));
          const ny = Math.max(60, Math.min(SCREEN_HEIGHT - 180, startRef.current.y + g.dy));
          const next = { x: nx, y: ny };
          posRef.current = next;
          setPos(next);
        },
        onPanResponderRelease: () => {
          if (!movedRef.current) setOpen(true);
        },
      }),
    [],
  );

  const academies = KIVOTOS_LOCATIONS.filter((l) => l.kind === '学园');
  const world = KIVOTOS_LOCATIONS.filter((l) => l.kind !== '学园');

  const [expanded, setExpanded] = useState<string | null>(null);

  const Section: React.FC<{ title: string; items: KivotosLocation[] }> = ({ title, items }) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: theme.subTextColor, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
        {title}（{items.length}）
      </Text>
      {items.map((l) => (
        <TouchableOpacity
          key={l.name}
          style={{
            backgroundColor: theme.inputBgColor,
            borderRadius: 10,
            padding: 10,
            marginBottom: 6,
          }}
          onPress={() => setExpanded(expanded === l.name ? null : l.name)}
        >
          <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '600' }}>{l.name}</Text>
          {expanded === l.name ? (
            <>
              <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
                {l.desc}
              </Text>
              {l.facilities && l.facilities.length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ color: theme.subTextColor, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                    校内地点（{l.facilities.length}）
                  </Text>
                  {l.facilities.map((f) => (
                    <Text
                      key={f}
                      style={{ color: theme.textColor, fontSize: 12, lineHeight: 18, marginBottom: 2 }}
                    >
                      · {f}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <>
      <View
        style={[styles.ballWrap, { left: pos.x, top: pos.y }]}
        {...panResponder.panHandlers}
      >
        <View style={[styles.ball, { backgroundColor: '#3E4C7A' }]}>
          <Text style={{ fontSize: 20 }}>🗺️</Text>
        </View>
        <Text style={{ color: '#fff', fontSize: 8, marginTop: 1 }}>地点</Text>
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View
            style={[styles.panel, { backgroundColor: theme.menuBgColor }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ color: theme.textColor, fontSize: 16, fontWeight: '700' }}>
                基沃托斯地点
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={{ color: theme.subTextColor, fontSize: 20 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.62 }}>
              <Section title="学园" items={academies} />
              <Section title="世界观" items={world} />
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  ballWrap: { position: 'absolute', alignItems: 'center' },
  ball: {
    width: BALL,
    height: BALL,
    borderRadius: BALL / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 18 },
  panel: { borderRadius: 16, padding: 16 },
});
