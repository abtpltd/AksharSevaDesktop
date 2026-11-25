import { useState } from 'react';
import { App, Button, Empty, Input, Modal, Popconfirm, Space } from 'antd';
import { actions, useAppState } from '../data/store';
import { visiblePosters } from '../core/library';

/** The poster library (D12): pick a picture added before, rename or remove the ones this center added. */
export function PosterPicker({ onPick, onClose }: { onPick: (image: string, name: string) => void; onClose: () => void }) {
  const { message } = App.useApp();
  const st = useAppState();
  const list = visiblePosters(st.posters, st.workingOrg).slice().reverse(); // newest first
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const levelName = (org: string) => st.levels.find((l) => l.path === org)?.name ?? org;

  const rename = () => {
    if (!renaming) return;
    const r = actions.renamePoster(renaming.id, renaming.name);
    if (!r.ok) { message.error(r.error); return; }
    setRenaming(null);
  };

  return (
    <Modal open title="Poster library" footer={<Button onClick={onClose}>Close</Button>} onCancel={onClose} destroyOnHidden width={620}>
      {list.length === 0 ? <Empty description="No posters yet. Upload one in the slide and choose Add to library." /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {list.map((p) => {
            const own = p.org === st.workingOrg;
            return (
              <div key={p.id} style={{ border: '1px solid #e0d6c4', borderRadius: 6, padding: 8 }}>
                <img alt={p.name} src={p.image} onClick={() => onPick(p.image, p.name)} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }} />
                {renaming?.id === p.id ? (
                  <Space.Compact style={{ marginTop: 6, width: '100%' }}>
                    <Input size="small" autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: p.id, name: e.target.value })} onPressEnter={rename} />
                    <Button size="small" type="primary" onClick={rename}>OK</Button>
                  </Space.Compact>
                ) : (
                  <div style={{ marginTop: 6, fontWeight: 600, wordBreak: 'break-word' }}>{p.name}</div>
                )}
                <div style={{ fontSize: 12, color: '#7a6a4f' }}>{own ? 'This center' : levelName(p.org)}</div>
                <Space size={4} style={{ marginTop: 6 }} wrap>
                  <Button size="small" type="primary" onClick={() => onPick(p.image, p.name)}>Use</Button>
                  {own && <Button size="small" onClick={() => setRenaming({ id: p.id, name: p.name })}>Rename</Button>}
                  {own && (
                    <Popconfirm title="Remove from the library?" description="Slides that already use it keep the picture." okText="Remove" onConfirm={() => actions.removePoster(p.id)}>
                      <Button size="small" danger>Remove</Button>
                    </Popconfirm>
                  )}
                </Space>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/** Asks for a name and keeps the picture in the library. */
export function AddToLibrary({ image, suggested, onDone, onClose }: { image: string; suggested: string; onDone: () => void; onClose: () => void }) {
  const { message } = App.useApp();
  const [name, setName] = useState(suggested);
  const [error, setError] = useState('');
  const save = () => {
    const r = actions.addPoster(name, image);
    if (!r.ok) { setError(r.error); return; }
    message.success('Added to the poster library');
    onDone();
  };
  return (
    <Modal open title="Add to the poster library" okText="Add" onOk={save} onCancel={onClose} destroyOnHidden width={420}>
      <Input autoFocus placeholder="Name, for example Diwali 2026" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} onPressEnter={save} />
      {error ? <div style={{ color: '#d64545', marginTop: 6 }}>{error}</div> : null}
    </Modal>
  );
}
