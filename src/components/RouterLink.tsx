import type { AnchorHTMLAttributes, Ref } from 'react'
import { Link } from '@tanstack/react-router'

type RouterLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  ref?: Ref<HTMLAnchorElement>
}

// Other origins, anchors, and the files the server hands over (/api/...).
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/api\/)/i

/** Astryx LinkProvider component: in-app hrefs become TanStack client-side
 * navigations (with intent preloading); external/anchor hrefs and file
 * downloads stay plain. */
export function RouterLink({ href, ref, ...props }: RouterLinkProps) {
  if (!href || EXTERNAL.test(href)) {
    return <a ref={ref} href={href} {...props} />
  }
  return <Link ref={ref} to={href} {...props} />
}
