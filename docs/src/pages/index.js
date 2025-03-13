import EnscribeLandingPage from "../components/EnscribeLandingPage"
import Head from "@docusaurus/Head"
import useDocusaurusContext from "@docusaurus/useDocusaurusContext"
import useBaseUrl from "@docusaurus/useBaseUrl"

// Custom page without Docusaurus Layout - this completely removes the header and footer
export default function Home() {
  const { siteConfig } = useDocusaurusContext()

  return (
    // Note: We're not using the Layout component at all here
    <>
      <Head>
        <title>{siteConfig.title} - ENS for Smart Contracts</title>
        <meta
          name="description"
          content="Automatically create ENS names for your smart contracts at deploy time, enhancing trust and transparency in web3."
        />
        <meta property="og:title" content={`${siteConfig.title} - ENS for Smart Contracts`} />
        <meta
          property="og:description"
          content="Automatically create ENS names for your smart contracts at deploy time, enhancing trust and transparency in web3."
        />
        <link rel="icon" href={useBaseUrl("/img/favicon.ico")} />
      </Head>
      <EnscribeLandingPage />
    </>
  )
}


