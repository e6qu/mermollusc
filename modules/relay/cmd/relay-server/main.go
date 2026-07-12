// Command relay-server runs the collaborative relay as a real, standalone WebSocket server — the
// production entrypoint. Same env-var contract as the JS relay it replaces:
//
//	PORT=1234 PERSIST_DIR=.collab-data go run ./cmd/relay-server
//
// Optional: AUTH0_DOMAIN + AUTH0_AUDIENCE (both required together) turn on Auth0 OIDC verification;
// MEMBERSHIP_FILE points at a static room/member role source instead of relying on token claims;
// ALLOWED_ORIGINS is a comma-separated list of additional browser Origins allowed to connect (same-host
// and loopback origins are always allowed; every other cross-origin upgrade is rejected with a 403).
// Absent PERSIST_DIR, rooms are in-memory only (zero-config dev).
package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/e6qu/mermollusc/modules/relay/auth"
	"github.com/e6qu/mermollusc/modules/relay/relay"
	"github.com/e6qu/mermollusc/modules/relay/store"
)

func main() {
	port := envInt("PORT", 1234)
	persistDir := os.Getenv("PERSIST_DIR")
	domain := os.Getenv("AUTH0_DOMAIN")
	audience := os.Getenv("AUTH0_AUDIENCE")
	membershipFile := os.Getenv("MEMBERSHIP_FILE")
	logger := log.Default()

	roomStore, storeLabel := buildStore(persistDir)

	authEnabled := domain != "" && audience != ""
	authorize := relay.Authorizer(relay.AllowAll)
	authLabel := "none"
	if authEnabled {
		verifier, err := auth.NewAuth0Verifier(domain, audience)
		if err != nil {
			log.Fatalf("collab relay: setting up Auth0 verifier: %v", err)
		}
		authorize = verifier
		authLabel = "auth0:" + domain
	}

	// Auth is on only when both Auth0 env vars are set. When OFF, a role-less connection can't exist
	// (no verified token), so we grant RoleEditor (dev/e2e). When ON, the resolver fails closed
	// (defaultRole ""): a verified token lacking a per-room role is denied, never silently promoted.
	defaultRole := relay.RoleEditor
	if authEnabled {
		defaultRole = ""
	}
	authorizeRoom := relay.RoomAuthorizer(relay.NewClaimsRoleResolver(defaultRole))
	membershipLabel := "token-claims"
	if membershipFile != "" {
		resolver, err := relay.LoadMembershipRoleResolver(membershipFile, defaultRole)
		if err != nil {
			log.Fatalf("collab relay: loading membership file: %v", err)
		}
		authorizeRoom = resolver
		membershipLabel = "file:" + membershipFile
	}

	core := relay.New(relay.Options{
		Store:         roomStore,
		Authorize:     authorize,
		AuthRequired:  authEnabled,
		AuthorizeRoom: authorizeRoom,
		Logger:        logger,
	})

	listener, err := net.Listen("tcp", ":"+strconv.Itoa(port))
	if err != nil {
		log.Fatalf("collab relay: listen: %v", err)
	}
	actualPort := listener.Addr().(*net.TCPAddr).Port
	origins := newOriginPolicy(os.Getenv("ALLOWED_ORIGINS"))
	registry := newSocketRegistry()
	// ReadHeaderTimeout bounds a slowloris that dribbles the WebSocket-upgrade request headers; IdleTimeout
	// reaps kept-alive HTTP connections that never upgrade. (An UPGRADED socket is hijacked past these — the
	// relay Core's auth-handshake reaper covers a connection that opens but never authenticates.)
	server := &http.Server{
		Handler:           newHandler(core, logger, origins, registry),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	shutdown := make(chan struct{})
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
		s := <-sig
		logger.Printf("collab relay: %v — closing connections, flushing rooms", s)
		// Drain BEFORE the final flush: hijacked WebSocket conns outlive server.Shutdown, so an edit
		// still inside the save-debounce window would otherwise arrive after FlushAll and be dropped.
		registry.drain()
		core.FlushAll()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
		close(shutdown)
	}()

	logger.Printf(
		"collab relay listening on localhost:%d (WebSocket, persistence=%s, auth=%s, membership=%s)",
		actualPort, storeLabel, authLabel, membershipLabel,
	)
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Fatalf("collab relay: %v", err)
	}
	<-shutdown
}

func buildStore(persistDir string) (relay.Store, string) {
	if persistDir == "" {
		return store.NewMemory(), "memory"
	}
	fs, err := store.NewFile(persistDir)
	if err != nil {
		log.Fatalf("collab relay: creating file store at %q: %v", persistDir, err)
	}
	return fs, "file:" + persistDir
}

func envInt(name string, def int) int {
	v := os.Getenv(name)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		log.Fatalf("collab relay: %s=%q is not an integer: %v", name, v, err)
	}
	return n
}
