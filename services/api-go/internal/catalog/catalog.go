// Package catalog reads the existing, locally curated conference catalogue.
// It deliberately performs no scraping or network requests at request time.
package catalog

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

type Collection struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Year  int    `json:"year"`
}

var collections = []Collection{
	{Key: "iclr_2026", Label: "ICLR 2026", Year: 2026},
	{Key: "chi_2026", Label: "CHI 2026", Year: 2026},
	{Key: "cvpr_2026", Label: "CVPR 2026", Year: 2026},
	{Key: "neurips_2025", Label: "NeurIPS 2025", Year: 2025},
	{Key: "icml_2025", Label: "ICML 2025", Year: 2025},
}

type Candidate struct {
	ID                int      `json:"id"`
	SourceProvider    string   `json:"source_provider"`
	SourceExternalID  string   `json:"source_external_id"`
	Title             string   `json:"title"`
	Authors           []string `json:"authors"`
	Abstract          *string  `json:"abstract"`
	Keywords          []string `json:"keywords"`
	Venue             *string  `json:"venue"`
	PublishedDate     *string  `json:"published_date"`
	LandingURL        *string  `json:"landing_url"`
	PDFURL            *string  `json:"pdf_url"`
	Collection        string   `json:"collection"`
	SourceRetrievedAt *string  `json:"source_retrieved_at"`
}

type Page struct {
	Items  []Candidate `json:"items"`
	Total  int         `json:"total"`
	Offset int         `json:"offset"`
	Limit  int         `json:"limit"`
}

func Collections() []Collection {
	return append([]Collection(nil), collections...)
}

func IsSupported(key string) bool {
	for _, collection := range collections {
		if collection.Key == key {
			return true
		}
	}
	return false
}

// Search reads the Python-owned conference_catalog_papers table without
// altering it. The selected scope is an explicit constant, never SQL input.
func Search(ctx context.Context, db *sql.DB, conferenceKey, query, scope string, offset, limit int) (Page, error) {
	if !IsSupported(conferenceKey) {
		return Page{}, fmt.Errorf("unsupported conference collection: %s", conferenceKey)
	}
	if scope == "" {
		scope = "title"
	}
	column, ok := map[string]string{
		"title":    "title",
		"abstract": "abstract",
		"keywords": "keywords_json",
	}[scope]
	if !ok {
		return Page{}, fmt.Errorf("unsupported catalogue search scope: %s", scope)
	}
	if offset < 0 || limit < 1 || limit > 25 {
		return Page{}, fmt.Errorf("offset must be non-negative and limit must be between 1 and 25")
	}

	where := "conference_key = ?"
	args := []any{conferenceKey}
	if needle := strings.TrimSpace(query); needle != "" {
		where += " AND COALESCE(" + column + ", '') LIKE ? COLLATE NOCASE"
		args = append(args, "%"+needle+"%")
	}

	var total int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM conference_catalog_papers WHERE "+where, args...).Scan(&total); err != nil {
		return Page{}, fmt.Errorf("count catalogue papers: %w", err)
	}
	rows, err := db.QueryContext(
		ctx,
		"SELECT id, source_external_id, title, authors_json, abstract, keywords_json, published_date, venue, landing_url, pdf_url, imported_at "+
			"FROM conference_catalog_papers WHERE "+where+" ORDER BY title ASC, id ASC LIMIT ? OFFSET ?",
		append(args, limit, offset)...,
	)
	if err != nil {
		return Page{}, fmt.Errorf("query catalogue papers: %w", err)
	}
	defer rows.Close()

	items := make([]Candidate, 0)
	for rows.Next() {
		candidate, err := scanCandidate(rows, conferenceKey)
		if err != nil {
			return Page{}, err
		}
		items = append(items, candidate)
	}
	if err := rows.Err(); err != nil {
		return Page{}, fmt.Errorf("iterate catalogue papers: %w", err)
	}
	return Page{Items: items, Total: total, Offset: offset, Limit: limit}, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanCandidate(row rowScanner, collection string) (Candidate, error) {
	var candidate Candidate
	var authorsJSON, keywordsJSON sql.NullString
	var abstract, publishedDate, venue, landingURL, pdfURL, importedAt sql.NullString
	if err := row.Scan(
		&candidate.ID,
		&candidate.SourceExternalID,
		&candidate.Title,
		&authorsJSON,
		&abstract,
		&keywordsJSON,
		&publishedDate,
		&venue,
		&landingURL,
		&pdfURL,
		&importedAt,
	); err != nil {
		return Candidate{}, fmt.Errorf("scan catalogue paper: %w", err)
	}
	candidate.SourceProvider = "conference_catalog"
	candidate.Collection = collection
	candidate.Authors = decodeStrings(authorsJSON.String)
	candidate.Keywords = decodeStrings(keywordsJSON.String)
	candidate.Abstract = nullableString(abstract)
	candidate.PublishedDate = nullableString(publishedDate)
	candidate.Venue = nullableString(venue)
	candidate.LandingURL = nullableString(landingURL)
	candidate.PDFURL = nullableString(pdfURL)
	candidate.SourceRetrievedAt = nullableString(importedAt)
	return candidate, nil
}

func decodeStrings(raw string) []string {
	var values []string
	if err := json.Unmarshal([]byte(raw), &values); err != nil {
		return []string{}
	}
	return values
}

func nullableString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}
