import { useEffect, useRef, useState } from 'preact/hooks';
import { Panel, Btn } from '../components/common';
import { SLOTS, saveGame, loadGame, listSaves, deleteSave, exportFile, importFile, type SaveMeta } from '../../core/save';
import { ui, refresh, toast, openModal } from '../store';
import { settings, saveSettings } from '../live';
import { setSoundEnabled } from '../sound';
import { weekInProgress } from '../../core/game';
import { Help } from '../components/Help';

const SLOT_NAME: Record<string, string> = { auto: '自动存档', slot1: '存档 1', slot2: '存档 2', slot3: '存档 3' };

function confirm(text: string): Promise<boolean | undefined> {
  return openModal<boolean>((close) => (
    <div class="panel modal">
      <div class="mtitle">确认</div>
      <div>{text}</div>
      <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={() => close(false)}>取消</Btn>
        <Btn kind="primary" onClick={() => close(true)}>
          确定
        </Btn>
      </div>
    </div>
  ));
}

export function SystemScreen() {
  const [saves, setSaves] = useState<(SaveMeta | null)[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const reload = () => {
    listSaves()
      .then(setSaves)
      .catch(() => setSaves([]));
  };
  useEffect(reload, []);
  return (
    <div class="col">
      <div class="page-title">系统</div>
      <Panel title="存档">
        {weekInProgress() && <div class="warn small mb8">本周流程进行中：存档会记录到当前进度（比赛中途存档的话，读档后该场比赛会从头开始）。</div>}
        <table class="px">
          <thead>
            <tr>
              <th>栏位</th>
              <th>学校</th>
              <th>日期</th>
              <th>保存时间</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot, i) => {
              const s = saves[i];
              return (
                <tr key={slot}>
                  <td class="accent">{SLOT_NAME[slot]}</td>
                  <td>{s ? `${s.school}（${s.name}）` : <span class="dim">—</span>}</td>
                  <td>{s?.date ?? ''}</td>
                  <td class="small muted">{s ? new Date(s.savedAt).toLocaleString() : ''}</td>
                  <td>
                    <span class="row gap4">
                      {slot !== 'auto' && (
                        <Btn
                          small
                          kind="primary"
                          onClick={async () => {
                            if (s && !(await confirm(`覆盖${SLOT_NAME[slot]}？`))) return;
                            try {
                              await saveGame(slot);
                              toast('保存成功', 'good');
                            } catch (e) {
                              toast(`保存失败：${(e as Error).message}`, 'bad');
                            }
                            reload();
                          }}
                        >
                          保存
                        </Btn>
                      )}
                      <Btn
                        small
                        disabled={!s}
                        onClick={async () => {
                          if (!(await confirm(`读取${SLOT_NAME[slot]}？当前未保存的进度将丢失。`))) return;
                          try {
                            if (await loadGame(slot)) {
                              ui.tab = 'home';
                              toast('读取成功', 'good');
                              refresh();
                            }
                          } catch (e) {
                            toast(`读取失败：${(e as Error).message}`, 'bad');
                          }
                        }}
                      >
                        读取
                      </Btn>
                      <Btn
                        small
                        kind="red"
                        disabled={!s}
                        onClick={async () => {
                          if (!(await confirm(`删除${SLOT_NAME[slot]}？`))) return;
                          await deleteSave(slot);
                          reload();
                        }}
                      >
                        删除
                      </Btn>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div class="row mt12">
          <Btn onClick={() => exportFile()}>导出存档文件</Btn>
          <Btn onClick={() => fileRef.current?.click()}>导入存档文件</Btn>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (!f) return;
              try {
                await importFile(f);
                ui.tab = 'home';
                toast('导入成功', 'good');
                refresh();
              } catch (err) {
                toast(`导入失败：${(err as Error).message}`, 'bad');
              }
            }}
          />
        </div>
        <div class="small dim mt8">存档保存在浏览器本地（IndexedDB）。清除浏览器数据会删除存档，重要的进度请导出备份。每周结束时会自动存档。</div>
      </Panel>
      <Panel title="设定">
        <div class="row">
          <span style={{ width: '120px' }}>音效</span>
          <Btn
            small
            on={settings.sound}
            onClick={() => {
              settings.sound = !settings.sound;
              setSoundEnabled(settings.sound);
              saveSettings();
              refresh();
            }}
          >
            {settings.sound ? '开' : '关'}
          </Btn>
        </div>
        <div class="row mt8">
          <span style={{ width: '120px' }}>比赛动画速度</span>
          {[1, 2, 3].map((s) => (
            <Btn
              key={s}
              small
              on={settings.animSpeed === s}
              onClick={() => {
                settings.animSpeed = s;
                saveSettings();
                refresh();
              }}
            >
              {s === 1 ? '普通' : s === 2 ? '快' : '瞬间'}
            </Btn>
          ))}
        </div>
        <div class="row mt8">
          <span style={{ width: '120px' }}>自动比赛时</span>
          <Btn
            small
            on={settings.stopAtKey}
            onClick={() => {
              settings.stopAtKey = !settings.stopAtKey;
              saveSettings();
              refresh();
            }}
          >
            {settings.stopAtKey ? '在关键时刻暂停' : '不暂停'}
          </Btn>
        </div>
        <div class="row mt8">
          <span style={{ width: '120px' }}>界面缩放</span>
          {[1, 1.25, 1.5, 2].map((z) => (
            <Btn
              key={z}
              small
              on={settings.zoom === z}
              onClick={() => {
                settings.zoom = z;
                document.documentElement.style.zoom = String(z);
                saveSettings();
                refresh();
              }}
            >
              {z * 100}%
            </Btn>
          ))}
        </div>
        <div class="small dim mt8">像素字体在 100% / 200% 时最清晰。</div>
      </Panel>
      <Panel title="游戏说明">
        <Help />
      </Panel>
      <Panel title="其他">
        <Btn
          kind="red"
          onClick={async () => {
            if (!(await confirm('返回标题画面？未保存的进度将丢失（每周结束时会自动存档）。'))) return;
            ui.screen = 'title';
            refresh();
          }}
        >
          返回标题画面
        </Btn>
        <div class="small dim mt8">像素甲子园 · 字体 Fusion Pixel Font（OFL-1.1）· 所有人名、校名、企业名皆为虚构。</div>
      </Panel>
    </div>
  );
}
