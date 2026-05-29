import type React from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface FooterPortalProps {
  children: React.ReactNode;
}

const FooterPortal: React.FC<FooterPortalProps> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const target = document.getElementById("footer-portal-element");
  if (!target) return null;

  return createPortal(children, target);
};

export default FooterPortal;
