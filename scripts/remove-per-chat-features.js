// 撤掉「给单个对话加的功能」：扮演模式开关、自导模式提示、对话场景开关、通讯录里的扮演入口
// 这些应该做成提示词里的文字指令，而不是每个对话一个开关。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function cutBlock(src, startMarker, endMarker, label) {
  const i = src.indexOf(startMarker);
  if (i < 0) {
    console.log(`  · 未找到 ${label}，跳过`);
    return src;
  }
  const j = src.indexOf(endMarker, i);
  if (j < 0) {
    console.log(`  · ${label} 找不到结束标记，跳过`);
    return src;
  }
  console.log(`  ✓ 移除 ${label}`);
  return src.slice(0, i) + src.slice(j + endMarker.length);
}

/* ---------------- RightDrawerContent：三个开关块 ---------------- */
{
  const F = path.join(ROOT, 'src', 'screens', 'RightDrawerContent.tsx');
  let s = fs.readFileSync(F, 'utf8');
  console.log('RightDrawerContent.tsx:');

  s = cutBlock(
    s,
    '            {/* 扮演模式（自导）：我暂时扮演本对话的 AI 角色 */}',
    '            ) : null}\n\n            {/* 场景模式',
    '扮演模式开关',
  );
  // cutBlock 把「场景模式」注释也吃掉了，补回来
  if (!s.includes('{/* 场景模式')) {
    s = s.replace('            <View\n              style={{\n                paddingHorizontal: 16,\n                paddingVertical: 12,\n                borderBottomWidth: 1,\n                borderBottomColor: theme.borderColor,\n              }}\n            >\n              <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: \'700\', marginBottom: 4 }}>\n                对话场景\n              </Text>',
      '            {/* 场景模式：桃信（禁动作）/ 现实（动作写括号里） */}\n            <View\n              style={{\n                paddingHorizontal: 16,\n                paddingVertical: 12,\n                borderBottomWidth: 1,\n                borderBottomColor: theme.borderColor,\n              }}\n            >\n              <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: \'700\', marginBottom: 4 }}>\n                对话场景\n              </Text>');
  }

  // 场景模式整块
  const sceneStart = s.indexOf('{/* 场景模式：桃信（禁动作）/ 现实（动作写括号里） */}');
  if (sceneStart >= 0) {
    const viewStart = s.indexOf('<View', sceneStart);
    // 该块以 </View> 结束，后面紧跟群聊注释
    const groupMark = s.indexOf('{/* 群聊：总设定', viewStart);
    if (viewStart > 0 && groupMark > viewStart) {
      const cut = s.slice(viewStart, groupMark);
      const lastClose = cut.lastIndexOf('</View>');
      if (lastClose > 0) {
        const endAbs = viewStart + lastClose + '</View>'.length;
        s = s.slice(0, viewStart) + s.slice(endAbs).replace(/^\s*\n/, '\n');
        console.log('  ✓ 移除对话场景开关');
      }
    }
  }

  // 自导模式已开启 提示块
  s = cutBlock(
    s,
    '            {/* 自导模式：玩家扮演某个角色给自己发消息（不触发 AI 回复） */}',
    '            ) : null}\n',
    '自导模式提示块',
  );

  fs.writeFileSync(F, s, 'utf8');
}

/* ---------------- GroupChatListScreen：通讯录菜单里的扮演入口 ---------------- */
{
  const F = path.join(ROOT, 'src', 'screens', 'GroupChatListScreen.tsx');
  let s = fs.readFileSync(F, 'utf8');
  console.log('GroupChatListScreen.tsx:');
  s = cutBlock(
    s,
    '            <TouchableOpacity\n              style={[styles.modalMenuItem, { borderBottomColor: theme.borderColor }]}\n              onPress={() => {\n                const t = contactMenuTarget;\n                setContactMenuTarget(null);\n                if (t) handlePrivateChatWithCharacter(t, true);\n              }}\n            >',
    '            </TouchableOpacity>\n\n',
    '通讯录菜单里的「扮演 TA」入口',
  );
  fs.writeFileSync(F, s, 'utf8');
}

console.log('\n完成');
