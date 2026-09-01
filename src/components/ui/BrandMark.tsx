interface BrandMarkProps {
  className?: string
}

export const BrandMark = ({ className = '' }: BrandMarkProps) => (
  <span className={`brand__mark ${className}`.trim()} aria-hidden="true">
    <svg viewBox="0 0 48 48">
      <rect className="brand-mark__plate" x="3" y="3" width="42" height="42" rx="14" />
      <path className="brand-mark__bubble" d="M13 15.5A5.5 5.5 0 0 1 18.5 10h11a5.5 5.5 0 0 1 5.5 5.5v9a5.5 5.5 0 0 1-5.5 5.5h-5.7L16 36v-6.6a5.5 5.5 0 0 1-3-4.9v-9Z" />
      <path className="brand-mark__wave" d="M18 20.2c1.5-1.5 3-2.2 4.5-2.2s3 .7 4.5 2.2 3 2.3 4.5 2.3" />
      <path className="brand-mark__wave brand-mark__wave--short" d="M18 25.7c1.2-1.1 2.5-1.7 3.8-1.7s2.6.6 3.9 1.7" />
      <circle className="brand-mark__spark" cx="36.5" cy="11.5" r="4.5" />
    </svg>
  </span>
)
