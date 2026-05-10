# syntax=docker/dockerfile:1.7

FROM nginx:1.27-alpine

ARG INEFFABLE_WEB_RELEASE_REPO=mofanh/ineffable-web
ARG INEFFABLE_WEB_RELEASE_TAG=latest
ARG INEFFABLE_WEB_RELEASE_BASE_URL=
ARG INEFFABLE_WEB_ARTIFACT=ineffable-web-dist.tar.gz

RUN apk add --no-cache ca-certificates curl jq tar

COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN --mount=type=secret,id=github_token,required=false set -eu; \
    artifact="${INEFFABLE_WEB_ARTIFACT}"; \
    if [ -n "$INEFFABLE_WEB_RELEASE_BASE_URL" ]; then \
        url="${INEFFABLE_WEB_RELEASE_BASE_URL%/}/${artifact}"; \
        curl -fsSL "$url" -o /tmp/ineffable-web-dist.tar.gz; \
    elif [ -s /run/secrets/github_token ]; then \
        token="$(cat /run/secrets/github_token)"; \
        if [ "$INEFFABLE_WEB_RELEASE_TAG" = "latest" ]; then \
            api_url="https://api.github.com/repos/${INEFFABLE_WEB_RELEASE_REPO}/releases/latest"; \
        else \
            api_url="https://api.github.com/repos/${INEFFABLE_WEB_RELEASE_REPO}/releases/tags/${INEFFABLE_WEB_RELEASE_TAG}"; \
        fi; \
        asset_url="$(curl -fsSL \
            -H "Authorization: Bearer ${token}" \
            -H "Accept: application/vnd.github+json" \
            "$api_url" \
            | jq -r --arg name "$artifact" '.assets[] | select(.name == $name) | .url' \
            | head -n 1)"; \
        test -n "$asset_url"; \
        test "$asset_url" != "null"; \
        curl -fsSL \
            -H "Authorization: Bearer ${token}" \
            -H "Accept: application/octet-stream" \
            "$asset_url" \
            -o /tmp/ineffable-web-dist.tar.gz; \
    elif [ "$INEFFABLE_WEB_RELEASE_TAG" = "latest" ]; then \
        url="https://github.com/${INEFFABLE_WEB_RELEASE_REPO}/releases/latest/download/${artifact}"; \
        curl -fsSL "$url" -o /tmp/ineffable-web-dist.tar.gz; \
    else \
        url="https://github.com/${INEFFABLE_WEB_RELEASE_REPO}/releases/download/${INEFFABLE_WEB_RELEASE_TAG}/${artifact}"; \
        curl -fsSL "$url" -o /tmp/ineffable-web-dist.tar.gz; \
    fi; \
    rm -rf /usr/share/nginx/html/*; \
    tar -xzf /tmp/ineffable-web-dist.tar.gz -C /usr/share/nginx/html; \
    test -f /usr/share/nginx/html/index.html; \
    rm -f /tmp/ineffable-web-dist.tar.gz

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
