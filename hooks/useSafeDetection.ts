// import { useConnect } from 'wagmi';
// import { useEffect, useState } from 'react';

// const AUTOCONNECTED_CONNECTOR_IDS = ['safe'];

// function useIsInSafeContext(): boolean {
//   const [isInSafe, setIsInSafe] = useState(false);

//   useEffect(() => {
//     // Check if we're running inside Safe by looking for Safe-specific globals
//     const checkSafeContext = () => {
//       // Method 1: Check for Safe Apps SDK global
//       if (typeof window !== 'undefined' && (window as any).__SAFE_APPS_SDK__) {
//         console.log('✅ Safe Apps SDK detected');
//         return true;
//       }

//       // Method 2: Check for Safe iframe context
//       try {
//         if (window.parent !== window) {
//           // We're in an iframe - check if parent is Safe
//           if (window.parent.location.hostname.includes('safe.global') ||
//               window.parent.location.hostname.includes('app.safe.global')) {
//             console.log('✅ Safe iframe context detected');
//             return true;
//           }
//         }
//       } catch (e) {
//         // Cross-origin access might be blocked, but that's also a good sign we're in an iframe
//         // This is common when embedded in Safe
//         console.log('✅ Cross-origin iframe detected (likely Safe)');
//         return true;
//       }

//       // Method 3: Check URL for Safe domains
//       if (typeof window !== 'undefined' && window.location.hostname.includes('safe.global')) {
//         console.log('✅ Safe domain detected in URL');
//         return true;
//       }

//       // Method 4: Check for Safe-specific URL patterns
//       if (typeof window !== 'undefined' && window.location.href.includes('/apps/')) {
//         console.log('✅ Safe app URL pattern detected');
//         return true;
//       }

//       return false;
//     };

//     setIsInSafe(checkSafeContext());
//   }, []);

//   return isInSafe;
// }

// function useAutoConnect() {
//   const { connect, connectors, isPending } = useConnect();
//   const isInSafe = useIsInSafeContext();

//   useEffect(() => {
//     if (!isInSafe) return;

//     console.log('🔄 Starting Safe auto-connect process...', {
//       connectorsAvailable: connectors.length,
//       isPending,
//       connectorIds: connectors.map(c => ({ id: c.id, ready: c.ready, name: c.name }))
//     });

//     // Wait a bit for connectors to be ready
//     const timer = setTimeout(() => {
//       AUTOCONNECTED_CONNECTOR_IDS.forEach((connectorId) => {
//         const connectorInstance = connectors.find((c) => c.id === connectorId);

//         if (connectorInstance) {
//           console.log('🔗 Auto-connecting to Safe connector:', {
//             id: connectorInstance.id,
//             name: connectorInstance.name,
//             ready: connectorInstance.ready
//           });

//           // Check if connector is ready before connecting
//           if (connectorInstance.ready) {
//             try {
//               connect({ connector: connectorInstance });
//               console.log('✅ Safe connection initiated');
//             } catch (error) {
//               console.error('❌ Failed to connect to Safe:', error);
//             }
//           } else {
//             console.warn('⚠️ Safe connector not ready yet, waiting...');
//             // Try again in a bit
//             setTimeout(() => {
//               if (connectorInstance.ready) {
//                 try {
//                   connect({ connector: connectorInstance });
//                   console.log('✅ Safe connection initiated (retry)');
//                 } catch (error) {
//                   console.error('❌ Failed to connect to Safe on retry:', error);
//                 }
//               } else {
//                 console.error('❌ Safe connector still not ready after retry');
//               }
//             }, 2000);
//           }
//         } else {
//           console.warn('⚠️ Safe connector not found or not ready:', {
//             connectorId,
//             availableConnectors: connectors.map(c => ({ id: c.id, ready: c.ready, name: c.name }))
//           });
//         }
//       });
//     }, 1500); // Increased delay to ensure connectors are ready

//     return () => clearTimeout(timer);
//   }, [connect, connectors, isInSafe, isPending]);
// }

// export { useAutoConnect, useIsInSafeContext };

import { useConnect } from 'wagmi';
import { useEffect } from 'react';

const AUTOCONNECTED_CONNECTOR_IDS = ['safe'];

function useAutoConnect() {
  const { connect, connectors } = useConnect();

  useEffect(() => {
    AUTOCONNECTED_CONNECTOR_IDS.forEach((connector) => {
      const connectorInstance = connectors.find((c) => c.id === connector && c.ready);

      if (connectorInstance) {
        connect({ connector: connectorInstance });
      }
    });
  }, [connect, connectors]);
}

export { useAutoConnect };