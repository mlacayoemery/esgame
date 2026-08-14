# GeoServer that can run as a non-root uid.
#
# This is the third image this repository builds, and the only one whose entire purpose is to undo
# a decision made upstream. It exists because the two alternatives were measured and are worse.
#
# THERE IS NO ROOTLESS GEOSERVER IMAGE TO USE INSTEAD. Read from docker.osgeo.org's own registry
# config blobs on 2026-08-14, not assumed: both `2.28.4` (what this repository pinned) and `3.0.0`
# declare `User ""` and the same `ENTRYPOINT ["bash", "/opt/startup.sh"]`. No tag mentions rootless.
# kartoza/geoserver was ruled out earlier: forced non-root it exits 10 on
# `groupadd: Permission denied`.
#
# AND THIS MOVES TO 3.0.0, which was published since the last time anyone checked — the note this
# replaces recorded 2.28.4 as the newest tag, and there is still no 2.29 at all. Verified as a
# major-version bump in its own right rather than assumed to be transparent: the three paths below
# are unchanged from 2.28.4, `GEOSERVER_DATA_DIR` is still `/opt/geoserver_data`, the calculator's
# REST usage still creates workspaces and uploads coverages (ingress-test.sh 18/18, both
# e2e-cluster browser rounds), and `tools/R/golden-test.sh` still returns
# HC 66 / HH 65 / NP 60 / RV 68 / WA 72 — the model's scores did not move.
#
# WHY NOT JUST SET runAsUser IN THE MANIFEST. Because it does not fail, it 404s. The startup script
# writes to paths the image leaves root-owned, and Tomcat comes up having silently skipped the
# webapp — "Server startup in [28806] milliseconds" and /geoserver/web returning 404.
#
# WHY NOT SEED emptyDirs FROM AN initContainer, which was tried first and got further than expected.
# Copying /usr/local/tomcat/conf and /opt/geoserver_data into emptyDirs, with fsGroup so the copies
# are writable, produces a pod that goes Ready, passes 18/18 in ingress-test.sh, and passes both
# browser rounds in v2/e2e-cluster. It is still wrong:
#
#   * the startup script also seds /usr/local/tomcat/webapps/geoserver/WEB-INF/web.xml to apply
#     CORS_ENABLED, and that fails. GeoServer's own CORS preflight goes from 200 with
#     Access-Control-Allow-Origin (root) to 403 (non-root). Everything above still passes because
#     ingress-nginx supplies CORS headers itself via enable-cors on geoserver-ingress — so the
#     manifest would go on asserting CORS_ENABLED: "true" while it silently did nothing. That is
#     the failure mode docs/verification-status.rst already refuses readOnlyRootFilesystem over.
#   * covering it means a third seeded emptyDir over a **125 MB** exploded webapp, rebuilt on every
#     pod start, pinned to the internal layout of an upstream war.
#
# One `chmod` at build time replaces all of that.
#
# COST, measured: 1.54 GB base -> 1.77 GB here. The 220 MB is overlayfs copying up the directories
# whose mode changed; there is no way to change a mode without materialising the layer. That buys a
# GeoServer that behaves as uid 10001 the way it did as root, on every check anyone here runs —
# verified against a live cluster and re-checked by the workflow that publishes it.
FROM docker.osgeo.org/geoserver:3.1.x

# gid 0, not a new group. The container already runs with gid 0, so group-writable is sufficient
# and nothing has to edit /etc/passwd or /etc/group — which is itself a thing that needs root.
#
# Only the paths the startup script actually writes. That list is measured, by running the image as
# uid 10001 and reading what it complained about, not inferred from the Dockerfile upstream:
#
#   /usr/local/tomcat/conf/healthcheck_url.txt          created at startup
#   /usr/local/tomcat/conf/server.xml                   rewritten at startup
#   /usr/local/tomcat/webapps/geoserver/WEB-INF/web.xml sed for CORS (temp file + rename)
#   /opt/geoserver_data                                 populated on first boot; the image ships
#                                                       only a .gitignore here, so there is nothing
#                                                       to preserve, only somewhere to write
#
# logs, work and temp are deliberately absent: they are already drwxrwxrwt in the image, so any uid
# can write them and touching them would grow the image for nothing.
USER root
RUN chgrp -R 0 \
      /usr/local/tomcat/conf \
      /usr/local/tomcat/webapps/geoserver/WEB-INF \
      /opt/geoserver_data \
 && chmod -R g+w \
      /usr/local/tomcat/conf \
      /usr/local/tomcat/webapps/geoserver/WEB-INF \
      /opt/geoserver_data

# Same uid as the calculation image. The frontend uses 101 because nginx's unprivileged image does.
USER 10001
