import { useState } from 'react'
import './ImageWithShimmer.css'

interface ImageWithShimmerProps {
  src: string
  alt: string
  className?: string
  loading?: 'eager' | 'lazy'
  onError?: () => void
}

interface ImageShimmerPlaceholderProps {
  className?: string
  label?: string
}

export function ImageShimmerPlaceholder({
  className = '',
  label = 'Loading image',
}: ImageShimmerPlaceholderProps) {
  return (
    <span
      className={`image-shimmer-placeholder ${className}`}
      role="status"
      aria-label={label}
    />
  )
}

function ImageWithShimmer({
  src,
  alt,
  className = '',
  loading = 'eager',
  onError,
}: ImageWithShimmerProps) {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading')

  return (
    <span className={`image-shimmer-frame ${className}`} data-image-state={imageState}>
      <span className="image-shimmer-placeholder" aria-hidden="true" />
      {imageState === 'error' && (
        <span className="image-shimmer-error" aria-hidden="true">Image unavailable</span>
      )}
      <img
        src={src}
        alt={alt}
        loading={loading}
        onLoad={() => setImageState('loaded')}
        onError={() => {
          setImageState('error')
          onError?.()
        }}
      />
    </span>
  )
}

export default ImageWithShimmer
