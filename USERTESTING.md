# User Testing

##### 27-05-26

With a clean slate (post-nuke), we will test all functionality looking for problems, bugs or ways to improve the current userflow.

###### Observation

On `/sites` When there are no sites configured, there is only a very basic message:
`No sites yet. Click “Add New Site” to get started.`
This can be improved, perhaps a graphic with a description on how to get started, maybe even have a 'wizard' at some point walking new users through the process of configuring a new site, adding some groups and then writing an article.

###### Flow: Add New Site

On `/sites` when the user clicks the `Add New Site` button, we are presented with A modal.

- [x] The background has a gradient which looks bad
- [x] The URL input seems to accept any input string, for instance I tested it with a string with a space, which should be invalid. Obviously it should validate to a domain url "something.thing"
- [ ] When the user fills out the form and clicks 'SUBMIT' button, there is a delay, this should be improved with some sort of progress indicator.

###### General: /sites page

The `/sites` page is rudimentary as we did not provide a great deal of information to claude (who generated it) as to what the purpose of this page will serve beyond listing the sites that are owned by the user.

Currently all that is shown is a Bar-shaped div with the Name of the site, the URL and two buttons **MANAGE** and **DELETE**.

Rather than the bar-shaped div, I want each site to be represented by a tile that shows more information, such as:

- [x] title _(human readable name of site - this is already provisioned in data)_
- [x] description _(... of site, content or purpose - NOT YET provisioned)_
- [x] splashImageUrl _(NOT YET provisioned)_
- [x] logoImageUrl _(NOT YET provisioned)_
- [x] url _(domain name - already provisioned)_
- [x] urlPrefix _(path prefix - already provisioned)_

The last 2 items can be used to compose what the parent path to the articles will be. Eg url: `www.big-site.com` and urlPrefix: `weblog` will produce the composed url `www.big-site.com/weblog`

Note: some of this data is poorly named: `url` should perhaps be `domainName` and `urlPrefix` might be better called `articlesPath` or something to that effect.

PROPOSED EXPANSION:
Alongside **MANAGE** and **DELETE**, I think we need another button: **CONFIGURE**.
This will take users to a new route `site/:siteName/configure` where the user can change the title, description, splash and logo images, the url or the urlPrefix.
**MANAGE** and **DELETE** will still do what they do now, Groups and Delete Site Modal respectively.

We can do more with this later too, im sure feature creep will help us fill this out as we progress.

---

##### 28-05-26

After working on the `/sites` view and adding the SiteTile component, which works well, we will continue the testing from there. Clicking the **MANAGE** button on a site takes the user to the `/article/list` page.

###### Observations

**ADD NEW GROUP MODAL BEHAVIOUR IS SUBOPTIMAL**
On the `/sites` page the first thing we need to do is add a **GROUP** to the site. The user experience here could be improved: When the user clicks `ADD NEW GROUP` button a modal opens up with a input for the Group Title, but when the user fills out the input and clicks `PROCEED` then only the text changes to `CREATING`. Once its finished the modal remains open.
If the user manually closes the modal then refreshes the page then the group has been made but a user is not to know that. This UX should be improved with a more prominent notice that something is happening and the modal should close when its finished.

**GROUP ITEMS LOOK UGLY**
The group element looks very basic, background colour is drab, the text is unstyled and not neatly arranged.

**SAVE ORDER BEHAVIOUR**
The `SAVE ORDER` button is always active. A better UX for this would be that it is disabled and only becomes enabled once the UI is no longer the same as what the order and arrangement is on the PDS data.
Similarly, it would be best if this could be used to prevent people from navigating away from the page if they have changed the order but have not saved it.
When you click `SAVE ORDER` button the acknowledgement is just a bit of green text appearing below `Order Saved`. We can do better than that. Build that Toast component

###### ACTION ITEM LIST

- [x] Improve the UX on `/article/list/SITENAME`, when user clicks `ADD NEW GROUP`, fills out the Group Name input and clicks `PROCEED` button, there should be user feedback, a progress spinner perhaps and once the group has been added the modal should close and the view update with the recently added group showing. **_NEEDS MORE WORK - What is the expected behaviour?_**
  - [x] Add a more prominent activity indicator than just `PROCEED` button label momentarily changing to `CREATING`
  - [x] Once the group has been created the modal should close and the page should update to show the new group.

- [x] Style Group Item component, it looks drab and unstyled.
  - [x] Better background colour
  - [x] Put the urlSlug into a neat wrapper 'pill' and center it inline
  - [x] Use the Trash icon instead of DELETE text for consistency
  - [x] Add Tooltips where they'll be useful.

- [x] SAVE ORDER button behaviour
  - [x] disabled until the order is not the same as that on the PDS
  - [x] warn user if they try to navigate away from the page if they have changed the order but not saved it
  - [x] Improve the `Order Saved` notification, build a Toast component.

###### New Components List

- [x] Bottom Buttons Portal - the ability to put buttons in the `<footer>` of the main layout
- [x] Toast Context Provider and Components
- [x] ReactRouter Navigation-Based Loading Spinner
- [ ] Universal / Site Wide Loading Spinner (or equivelent) (Context)

###### New Features

- [x] `<Toast>`: Add a countdown timer around the X close button when it is set to autoexpire.
  - [ ] Hover should pause it (?) **_HAVE A THINK ABOUT BEHAVIOUR_**

---

##### 31-05-26

Lots of good progress made on the above, whilst testing the above implemetations we started to encounter other issues

###### Observations

DRAFT NEW ARTICLE UX
The UX is suboptimal for CREATE/DRAFT NEW ARTICLE. Once you have navigated to `/article/create`, filled out the required inputs and submitted your new article with the SAVE TO PDS button. The article is saved as you might expect but the user is kept on the page (after a brief loading spinner interval). If the user adds more content then again presses SAVE TO PDS again then it exhibits the same behaviour but the subsequent changes are not persisted.
Do we navigate the user back to the articles page (maybe we should have a 'recent articles' section on `/article/list` view?).
ANother option is to merge create and edit into one route but that could be messier. **_NEEDS MORE THOUGHT_**

###### ACTION ITEM LIST

- [ ] Draft New Article UX improvements **_THINK ABOUT HOW BEST TO GO ABOUT THIS_**

---

##### 09-07-26

**Fresh-account onboarding audit.** Entry point into the Contributors work — before building an Owner/Contributor flow we need to know what a brand-new user actually sees. Plan:

1. Delete NoRobots from the `anthonycregan.dev` Bluesky account (removes the existing `site.standard.publication` + its documents)
2. Sign into the CMS as a genuinely new user — handle `norobots.blog`, blank account, no prior sites/articles/images
3. Walk the full first-run flow with nothing pre-provisioned, logging every point of friction or missing guidance
4. Create a new site (NoRobots.blog)
5. Re-populate it with the content previously managed under `anthonycregan.dev`

Working hypothesis going in: a first-login welcome modal may be worth building. Confirm or kill that once the walkthrough is done, don't build it pre-emptively.

###### Observations

_(log each as you hit it — screen, what's missing/confusing, what would fix it)_

- [ ] `/login` — first impression, before any auth
- [ ] Post-auth landing (`/`) — blank dashboard, no sites/articles/images yet
- [ ] `/sites` — empty state (already flagged 27-05-26 as basic; revisit with truly fresh eyes)
- [ ] Add New Site flow — anything unclear about required fields (domain, basePath, etc.)
- [ ] `/groups` — empty state, first Add New Group
- [ ] `/article/create` — first article with no site/group context yet
- [ ] Publish flow (`/article/list`) — first time picking a site + group
- [ ] `/images` — empty Image Library, first upload
- [ ] Anywhere else the app assumes prior state that a new user won't have

###### ACTION ITEM LIST


- [ ] Complete fresh-account walkthrough end to end

Deleting records from AnthonyCregan.dev PDS:
  - [ ] Delete Site action is too easy and could be done by accident - Perhaps Add an input that asks to enter the domain name to confirm they wish to delete it.

  - [ ] Add New Site Modal - Still has image URL text inputs for both splash image and logo image URLs, these should be a image library picker for each one

  - [ ] Once you have created a new site and gone to the relevant /article/list/**SITE** page, when you make your first group it still has "Drop articles here" and dotted line styles left over from the drag and drop feature we phases out here.  

  - [x] `/images` — Upload Images modal: every pending-file preview showed a broken image icon with the filename as fallback alt text, for all files regardless of type. Root cause: CSP `img-src 'self' data: https:` didn't allow `blob:`, so the browser blocked every `URL.createObjectURL(file)` preview `<img>` before it could render. **FIXED** on `fix/csp-blob-image-preview` — added `blob:` to `img-src`.

First Login as NoRobots.blog Bsky User:
Dashboard:
 - New Group button should be disabled when there are no sites to add them to.
 - SITES column has "No sites yet. Create your first site" link (and that is white text on white background). This should be expanded massively. Maybe on first login the dashboard should be a welcome screen instead? Engagement and Recently Updated columns are totally redundant at this point. The only things a new user could be concerned about at this point is writing a new article or adding a new site.

Image Library:
 - First Impressions here are a little confusing. All I see is the User folder for my other login "Anthony Cregan Images". We should probably drop the "library is shared with all users" thing (as mentioned elsewhere). We should have a Image folder for the current user by default, even before they've uploaded an image. 

 - Image upload previews are just broken image placeholders now

 
- [ ] Decide: first-time login welcome modal — build or drop
- [ ] Re-populate NoRobots.blog content under the new account