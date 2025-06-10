import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head></Head>
      <body className="antialiased">
        <Main />
        <NextScript />
        <script
          data-nscript={'lazyOnload'}
          src="https://www.googletagmanager.com/gtag/js?id=G-ZP0CQ3RP8K"
        ></script>
        <script id={'ga-script'} data-nscript={'lazyOnload'}>
          {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());

                gtag('config', 'G-ZP0CQ3RP8K');
                `}
        </script>
      </body>
    </Html>
  )
}
