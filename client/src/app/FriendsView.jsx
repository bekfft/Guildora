import { Search, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';

const TABS = ['Online', 'Alle', 'Ausstehend', 'Blockiert'];

export default function FriendsView() {
  const [tab, setTab] = useState('Online');
  return (
    <section className="friends-view">
      <div className="friends-tabs" role="tablist" aria-label="Freundesfilter">
        {TABS.map((item) => <button type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}
      </div>
      <div className="friends-empty">
        <div className="friends-illustration" aria-hidden="true">
          <div><UserRoundCheck size={58} /></div>
          <span /><span /><span />
          <Search size={23} />
        </div>
        <h2>Hier ist es noch ganz ruhig</h2>
        <p>{tab === 'Ausstehend' ? 'Du hast aktuell keine offenen Anfragen.' : `In „${tab}“ gibt es noch nichts zu sehen.`}</p>
      </div>
    </section>
  );
}
