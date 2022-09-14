import contentTypes from "./content-types.js";
import html from "./html.js";
import {
  generateErrorJSONResponse,
  generateJSONResponse
} from "./json-response.js";
import Scraper from "./scraper.js";

// Cloudflare supports the GET, POST, HEAD, and OPTIONS methods from any origin,
// and allow any header on requests. These headers must be present
// on all responses to all CORS preflight requests. In practice, this means
// all responses to OPTIONS requests.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function handleOptions(request) {
  // Make sure the necessary headers are present
  // for this to be a valid pre-flight request
  let headers = request.headers;
  if (
    headers.get("Origin") !== null &&
    headers.get("Access-Control-Request-Method") !== null &&
    headers.get("Access-Control-Request-Headers") !== null
  ) {
    // Handle CORS pre-flight request.
    // If you want to check or reject the requested method + headers
    // you can do that here.
    let respHeaders = {
      ...corsHeaders,
      // Allow all future content Request headers to go back to browser
      // such as Authorization (Bearer) or X-Client-Name-Version
      "Access-Control-Allow-Headers": request.headers.get(
        "Access-Control-Request-Headers"
      ),
    };

    return new Response(null, {
      headers: respHeaders,
    });
  } else {
    // Handle standard OPTIONS request.
    // If you want to allow other HTTP Methods, you can do that here.
    return new Response(null, {
      headers: {
        Allow: "GET, HEAD, POST, OPTIONS",
      },
    });
  }
}

addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method === "OPTIONS") {
    // Handle CORS preflight requests
    event.respondWith(handleOptions(request));
  } else if (
    request.method === "GET" ||
    request.method === "HEAD" ||
    request.method === "POST"
  ) {
    // Handle requests to the API server
    event.respondWith(handleRequest(request));
  } else {
    event.respondWith(
      new Response(null, {
        status: 405,
        statusText: "Method Not Allowed",
      })
    );
  }
});

async function handleRequest(request) {
  const reqestUrl = new URL(request.url);
  const searchParams = reqestUrl.searchParams;

  let url = searchParams.get("url");
  if (url && !url.match(/^[a-zA-Z]+:\/\//)) url = "http://" + url;

  const selector = searchParams.get("selector");
  const attr = searchParams.get("attr");
  const spaced = searchParams.get("spaced"); // Adds spaces between tags
  const pretty = searchParams.get("pretty");

  if (!url || !selector) {
    if (url) {
      try {
        // Rewrite request to point to API URL. This also makes the request mutable
        // so you can add the correct Origin header to make the API server think
        // that this request is not cross-site.
        const requestClone = new Request(request);
        requestClone.headers.set("Origin", new URL(url).origin);
        if (url.includes("api.riotgames.com")) {
          requestClone.headers.set("X-Riot-Token", `${RIOT_API_TOKEN}`);
        } else if (url.includes("whatismymmr.com")) {
          requestClone.headers.set("User-Agent", `${WIMMMR_USER_AGENT}`);
        }
        let response = await fetch(url, {
          method: requestClone.method,
          headers: requestClone.headers,
          body: requestClone.body,
        });

        // Recreate the response so you can modify the headers
        response = new Response(response.body, response);

        // Set CORS headers
        response.headers.set("Access-Control-Allow-Origin", "*");

        // Append to/Add Vary header so browser will cache response correctly
        response.headers.append("Vary", "Origin");

        return response;
      } catch (error) {
        return generateErrorJSONResponse(error, pretty);
      }
    }
    return handleSiteRequest(request);
  }

  return handleAPIRequest({ url, selector, attr, spaced, pretty });
}

async function handleSiteRequest(request) {
  const url = new URL(request.url);

  if (url.pathname === "/" || url.pathname === "") {
    return new Response(html, {
      headers: { "content-type": contentTypes.html },
    });
  }

  return new Response("Not found", { status: 404 });
}

async function handleAPIRequest({ url, selector, attr, spaced, pretty }) {
  let scraper, result;

  try {
    scraper = await new Scraper().fetch(url);
  } catch (error) {
    return generateErrorJSONResponse(error, pretty);
  }

  try {
    if (!attr) {
      result = await scraper.querySelector(selector).getText({ spaced });
    } else {
      result = await scraper.querySelector(selector).getAttribute(attr);
    }
  } catch (error) {
    return generateErrorJSONResponse(error, pretty);
  }

  return generateJSONResponse({ result }, pretty);
}
