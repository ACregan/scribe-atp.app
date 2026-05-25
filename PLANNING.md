# SCRIBE CMS DATA STRUCTURE

## Definitions

### User classifications

A OWNER is a user with the highest level of privileges, they can add, remove and change the SITEs via the CMS. They can add GROUPS and change the order they appear in. They can write ARTICLES and add them to GROUPS. They can add other users as CONTRIBUTORS to SITES. They can also see ARTICLES that CONTRIBUTORS have provided to this SITE and add them to GROUPS.

A CONTRIBUTOR is a user who has the ability to write articles for any SITE that they are a contributor to. Any article they write for that SITE will be available to the OWNER to add to GROUPS and publish on the SITE.

A user can become a CONTRIBUTOR after a OWNER adds the user to the Contributors list via the SITE management page. The exact mechanism as to how this can be achieved is not fully planned and this requires more thought. I think perhaps an email can be sent by the OWNER to the user who wishes to be a CONTRIBUTOR, the email (or bluesky dm?) will have a link the new CONTRIBUTOR clicks to join the list of contributors. Alternatives can be considered and I would welcome any ideas on other ways to achieve this.

## Concepts

A SITE is a reference to a website that we will use our CMS app to manage articles and content for. Its data comprises of a 'url' (string), 'title' (string), 'urlPrefix' (string), 'ownerId' (string: id of the user who is the owner of this site), 'contributors' (array, list of ids of users who can contribute articles to this site), 'groups' (array of objects, representing each of the groups of articles listed under this site)

A GROUP represents a collection of articles that are grouped together. Its data comprises of an array of objects. Each object represents a group and each group has a 'slug' (string) which is a section of the url that represents this category, 'title' (string) is the name that will be displayed in the UI, 'articles' (array of strings, each string being the slug of the articles that belong to this group)

AN ARTICLE represents an article or document, it comprises of a 'url' (string), 'title' (string), 'content' (string, serialised html) and 'createdAt' (string: timestamp)

## Rules

A SITE is owned by one single OWNER, the data for that site is stored on the OWNERs PDS

A SITE OWNER is solely responsible for the creation and order of GROUPS within the SITE(s) they own.

A SITE OWNER is solely responsible for assigning ARTICLES to GROUPS

## Data Structures

### Site

AT Protocol collection: `app.scribe.site`, rkey = URL-derived slug (e.g. `norobots-blog`)

```json
{
  "$type": "app.scribe.site",
  "url": "norobots.blog",
  "title": "NoRobots.blog",
  "urlPrefix": "blog",
  "contributors": ["did:plc:contributorOneId", "did:plc:contributorTwoId"],
  "groups": [
    {
      "slug": "engineering",
      "title": "Engineering",
      "articles": [
        "at://did:plc:ownerId/app.scribe.article/my-first-post",
        "at://did:plc:contributorOneId/app.scribe.article/their-article"
      ]
    },
    {
      "slug": "design",
      "title": "Design",
      "articles": ["at://did:plc:ownerId/app.scribe.article/design-principles"]
    }
  ],
  "articles": ["at://did:plc:ownerId/app.scribe.article/ungrouped-post"],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-06-01T12:00:00.000Z"
}
```

Notes:

- `ownerId` is omitted — the owner is whoever's PDS holds this record (their DID is the repo DID)
- Article references are full AT URIs (`at://did/collection/rkey`) so articles from contributor PDSes can be included alongside owner articles
- `articles` at the top level holds ungrouped articles (same role as the ROOT virtual group in the current manifest)
- `groups` order is significant — it determines display order on the site
- `updatedAt` is useful for cache invalidation by public readers

### Article

AT Protocol collection: `app.scribe.article`, rkey = url slug (e.g. `my-first-post`)

```json
{
  "$type": "app.scribe.article",
  "title": "My First Post",
  "url": "my-first-post",
  "content": "<p>Article body as serialised HTML.</p>",
  "splashImageUrl": "https://norobots.blog/images/my-first-post.jpg",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

Notes:
- The article record is intentionally site-agnostic — it has no reference to any site or group
- The relationship between an article and a site is owned entirely by the SITE record (via AT URI in `groups[].articles` or top-level `articles`)
- The author is implicit from whose PDS holds the record — no `authorId` field is needed; the AT URI (`at://did/app.scribe.article/slug`) carries that information
- `url` doubles as the rkey — the slug used in the AT URI and in the public-facing URL path
- `splashImageUrl` is optional
