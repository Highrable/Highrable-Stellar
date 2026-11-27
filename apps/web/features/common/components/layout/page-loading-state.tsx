import React from "react";

import styles from "./page-loading-state.module.css";

interface IPageLoadingStateProps {
  readonly label?: string;
}

function HandshakeArtworkLayer({ className }: { readonly className: string }) {
  return (
    <div className={`${styles.artworkLayer} ${className}`}>
      <div className={`${styles.figure} ${styles.left}`}>
        <img src="/loader/handshake-left.png" alt="" />
      </div>
      <div className={`${styles.figure} ${styles.right}`}>
        <img src="/loader/handshake-right.png" alt="" />
      </div>
    </div>
  );
}

export function PageLoadingState({ label = "page" }: IPageLoadingStateProps) {
  return (
    <div className={styles.viewport} role="status" aria-live="polite" aria-atomic="true">
      <span className={styles.visuallyHidden}>Loading {label}...</span>
      <div className={styles.tile} aria-hidden="true">
        <div className={styles.figures}>
          <HandshakeArtworkLayer className={styles.ghost} />
          <HandshakeArtworkLayer className={styles.fill} />
        </div>
      </div>
    </div>
  );
}
