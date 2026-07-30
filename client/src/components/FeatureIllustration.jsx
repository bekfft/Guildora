export default function FeatureIllustration({ type }) {
  return (
    <div className={`feature-art feature-art--${type}`} aria-hidden="true">
      <svg viewBox="0 0 560 360" role="img">
        <defs>
          <linearGradient id={`glow-${type}`} x1="0" x2="1">
            <stop offset="0" stopColor="#8ea1ff" />
            <stop offset="1" stopColor="#5865f2" />
          </linearGradient>
        </defs>
        <rect x="55" y="45" width="450" height="270" rx="28" fill="#272a31" />
        <rect x="75" y="65" width="100" height="230" rx="18" fill="#1e1f22" />
        <circle cx="105" cy="100" r="17" fill={`url(#glow-${type})`} />
        <circle cx="145" cy="100" r="17" fill="#3f424a" />
        <rect x="92" y="138" width="66" height="8" rx="4" fill="#626773" />
        <rect x="92" y="159" width="50" height="8" rx="4" fill="#4d515b" />
        <rect x="195" y="67" width="290" height="50" rx="15" fill="#383a40" />
        <circle cx="225" cy="92" r="14" fill="#f0b232" />
        <rect x="251" y="83" width="112" height="8" rx="4" fill="#b5bac1" />
        <rect x="251" y="98" width="74" height="6" rx="3" fill="#686d78" />
        <rect x="195" y="132" width="220" height="65" rx="15" fill="#383a40" />
        <circle cx="225" cy="161" r="14" fill="#23a559" />
        <rect x="251" y="151" width="135" height="8" rx="4" fill="#dbdee1" />
        <rect x="251" y="168" width="100" height="7" rx="3.5" fill="#777c87" />
        {type === 'voice' ? (
          <>
            <circle cx="290" cy="246" r="32" fill="#5865f2" />
            <circle cx="365" cy="246" r="32" fill="#eb459e" />
            <path d="M280 247q10 13 20 0M355 247q10 13 20 0" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round" />
            <path d="M264 285q63 27 126 0" stroke="#23a559" strokeWidth="8" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <rect x="195" y="213" width="290" height="62" rx="15" fill="#383a40" />
            <circle cx="225" cy="244" r="14" fill={type === 'community' ? '#eb459e' : '#ed4245'} />
            <rect x="251" y="234" width="155" height="8" rx="4" fill="#dbdee1" />
            <rect x="251" y="251" width="118" height="7" rx="3.5" fill="#777c87" />
          </>
        )}
        <circle cx="485" cy="55" r="34" fill="#f2f3f5" />
        <path d="M470 57q15-20 30 0M478 68q7 7 14 0" stroke="#5865f2" strokeWidth="6" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}
