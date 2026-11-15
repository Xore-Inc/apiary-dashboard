import type { AnchorHTMLAttributes, Ref } from 'react'
import { Link } from '@tanstack/react-router'

type RouterLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  ref?: Ref<HTMLAnchorElement>
  /** How this link preloads its page, when not the router's default
   * (intent): `viewport` for the links an operator is likely to click,
   * e.g. a list's first rows (#309). Astryx's Link passes it through. */
  'data-preload'?: 'viewport' | 'intent' | 'render'
}

// Other origins, anchors, and the files the server hands over (/api/...).
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/api\/)/i

/** Astryx LinkProvider component: in-app hrefs become TanStack client-side
 * navigations (with intent preloading); external/anchor hrefs and file
 * downloads stay plain. */
export function RouterLink({ href, ref, 'data-preload': preload, ...props }: RouterLinkProps) {
  if (!href || EXTERNAL.test(href)) {
    return <a ref={ref} href={href} {...props} />
  }
  return <Link ref={ref} to={href} preload={preload} {...props} />
}
