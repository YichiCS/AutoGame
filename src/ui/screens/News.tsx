import { useState } from 'preact/hooks';
import type { Message, NewsItem } from '../../core/types';
import { G } from '../../core/state';
import { Panel, Btn, Tabs, Empty } from '../components/common';
import { refresh, openModal } from '../store';
import { shortDate, WEEKS } from '../../core/calendar';

const KIND: Record<NewsItem['kind'], string> = { result: '大会', world: '世间', draft: '选秀', school: '本校', pro: '职业', recruit: '招募' };

function openMail(m: Message) {
  m.read = true;
  refresh();
  void openModal((close) => (
    <div class="panel modal">
      <div class="mtitle">{m.title}</div>
      <div style={{ whiteSpace: 'pre-line' }}>{m.body}</div>
      <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={() => close()}>关闭</Btn>
      </div>
    </div>
  ));
}

export function NewsScreen() {
  const [tab, setTab] = useState<'mail' | 'news' | 'draft'>('mail');
  const [kind, setKind] = useState<NewsItem['kind'] | 'all'>('all');
  const news = G.news.filter((n) => kind === 'all' || n.kind === kind);
  return (
    <div class="col">
      <div class="page-title">资讯</div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'mail', label: `信件（${G.inbox.filter((m) => !m.read).length} 未读）` },
          { id: 'news', label: '新闻' },
          { id: 'draft', label: '选秀记录' },
        ]}
      />
      {tab === 'mail' && (
        <Panel
          title="信件"
          right={
            <Btn
              small
              onClick={() => {
                for (const m of G.inbox) m.read = true;
                refresh();
              }}
            >
              全部已读
            </Btn>
          }
        >
          {G.inbox.length ? (
            G.inbox.map((m) => (
              <div key={m.id} class="row listitem" style={{ cursor: 'pointer' }} onClick={() => openMail(m)}>
                <span class={m.read ? 'dim' : 'accent'}>{m.read ? '○' : '●'}</span>
                <span class="dim small">{shortDate(m.absWeek % WEEKS)}</span>
                <span class={`grow ${m.kind === 'offer' ? 'good' : m.kind === 'bad' ? 'bad' : ''}`}>{m.title}</span>
              </div>
            ))
          ) : (
            <Empty>没有信件</Empty>
          )}
        </Panel>
      )}
      {tab === 'news' && (
        <Panel
          title="新闻"
          right={
            <div class="row gap4">
              <Btn small on={kind === 'all'} onClick={() => setKind('all')}>
                全部
              </Btn>
              {(Object.keys(KIND) as NewsItem['kind'][]).map((k) => (
                <Btn key={k} small on={kind === k} onClick={() => setKind(k)}>
                  {KIND[k]}
                </Btn>
              ))}
            </div>
          }
        >
          {news.length ? (
            news.slice(0, 120).map((n, i) => (
              <div key={i} class="listitem small">
                <span class="dim">[{G.startYear + Math.floor(n.absWeek / WEEKS)} {shortDate(n.absWeek % WEEKS)}]</span> <span class="tag">{KIND[n.kind]}</span> {n.text}
              </div>
            ))
          ) : (
            <Empty>暂无新闻</Empty>
          )}
        </Panel>
      )}
      {tab === 'draft' && (
        <Panel title="职业选秀（高中生）">
          {G.draftLog.length ? (
            G.draftLog.map((d) => (
              <div key={d.year} class="mb8">
                <div class="accent">{d.year} 年选秀会议</div>
                <table class="px">
                  <thead>
                    <tr>
                      <th>轮次</th>
                      <th>球队</th>
                      <th>姓名</th>
                      <th>学校</th>
                      <th>位置</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.picks.map((p, i) => (
                      <tr key={i} class={p.mine ? 'sel' : ''}>
                        <td>{p.ikusei ? '育成' : `第${p.round}轮`}</td>
                        <td>{p.team}</td>
                        <td class={p.mine ? 'accent' : ''}>{p.name}</td>
                        <td>{p.school}</td>
                        <td>{p.pos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          ) : (
            <Empty>每年 10 月下旬举行选秀会议</Empty>
          )}
        </Panel>
      )}
    </div>
  );
}
