const imageHosts=new Set(["terraqoglobal.com","portal.terraqoglobal.com","images.unsplash.com"]);
export function isTrustedSocialImage(url:URL){
 return url.protocol==="https:"&&imageHosts.has(url.hostname)&&!url.username&&!url.password&&!url.port;
}
