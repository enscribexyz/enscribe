import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const AppUrl = () => {
  const {
    siteConfig: {customFields},
  } = useDocusaurusContext();
  const url = customFields.appUrl || 'appUrl is not defined'
  const shortUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, "");
  return (<a href={url} target="_blank">{shortUrl}</a>);
}

export default AppUrl;
