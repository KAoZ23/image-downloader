import html from './html.js';
import { Checkbox } from './Checkbox.js';
import {
  DownloadImageButton,
  ImageUrlTextbox,
  OpenImageButton,
} from './ImageActions.js';

const ls = localStorage;

const allImages = [];
let visibleImages = [];
const linkedImages = {};

// Add images to `allImages` and trigger filtration
// `send_images.js` is injected into all frames of the active tab, so this listener may be called multiple times
chrome.runtime.onMessage.addListener((result) => {
  Object.assign(linkedImages, result.linkedImages);
  result.images.forEach((image) => {
    if (!allImages.includes(image)) {
      allImages.push(image);
    }
  });
  filterImages();
});

function toggleDimensionFilter(element, option, value) {
  if (value !== undefined) {
    ls[option] = value;
  }
  $(element).toggleClass('light', ls[option] !== 'true');
  filterImages();
}

function suggestNewFilename(item, suggest) {
  let newFilename = '';
  if (ls.folder_name) {
    newFilename = `${ls.folder_name}/`;
  }
  if (ls.new_file_name) {
    const regex = /(?:\.([^.]+))?$/;
    const extension = regex.exec(item.filename)[1];
    if (parseInt(ls.image_count, 10) === 1) {
      newFilename += `${ls.new_file_name}.${extension}`;
    } else {
      newFilename += `${ls.new_file_name}${ls.image_number}.${extension}`;
      ls.image_number++;
    }
  } else {
    newFilename += item.filename;
  }
  suggest({ filename: newFilename });
}

// TODO: Use debounce
let filterImagesTimeoutId;
function filterImages() {
  clearTimeout(filterImagesTimeoutId); // Cancel pending filtration
  filterImagesTimeoutId = setTimeout(() => {
    const images_cache = $('#images_cache');
    if (
      ls.show_image_width_filter === 'true' ||
      ls.show_image_height_filter === 'true'
    ) {
      const numberOfCachedImages = images_cache.children().length;
      if (numberOfCachedImages < allImages.length) {
        for (
          let index = numberOfCachedImages;
          index < allImages.length;
          index++
        ) {
          // Refilter the images after they're loaded in cache
          images_cache.append(
            html`
              <img src=${encodeURI(allImages[index])} onLoad=${filterImages} />
            `
          );
        }
      }
    }

    // Copy all images initially
    visibleImages = allImages.slice(0);

    if (ls.show_url_filter === 'true') {
      let filterValue = $('#filter_textbox').val();
      if (filterValue) {
        switch (ls.filter_url_mode) {
          case 'normal':
            const terms = filterValue.split(/\s+/);
            visibleImages = visibleImages.filter((url) => {
              for (let index = 0; index < terms.length; index++) {
                let term = terms[index];
                if (term.length !== 0) {
                  const expected = term[0] !== '-';
                  if (!expected) {
                    term = term.substr(1);
                    if (term.length === 0) {
                      continue;
                    }
                  }
                  const found = url.indexOf(term) !== -1;
                  if (found !== expected) {
                    return false;
                  }
                }
              }
              return true;
            });
            break;
          case 'wildcard':
            filterValue = filterValue
              .replace(/([.^$[\]\\(){}|-])/g, '\\$1')
              .replace(/([?*+])/, '.$1');
          /* fall through */
          case 'regex':
            visibleImages = visibleImages.filter((url) => {
              try {
                return url.match(filterValue);
              } catch (e) {
                return false;
              }
            });
            break;
        }
      }
    }

    if (
      ls.show_only_images_from_links === 'true' &&
      ls.only_images_from_links === 'true'
    ) {
      visibleImages = visibleImages.filter((url) => linkedImages[url]);
    }

    if (
      ls.show_image_width_filter === 'true' ||
      ls.show_image_height_filter === 'true'
    ) {
      visibleImages = visibleImages.filter((url) => {
        const image = images_cache.children(`img[src="${encodeURI(url)}"]`)[0];
        return (
          (ls.show_image_width_filter !== 'true' ||
            ((ls.filter_min_width_enabled !== 'true' ||
              ls.filter_min_width <= image.naturalWidth) &&
              (ls.filter_max_width_enabled !== 'true' ||
                image.naturalWidth <= ls.filter_max_width))) &&
          (ls.show_image_height_filter !== 'true' ||
            ((ls.filter_min_height_enabled !== 'true' ||
              ls.filter_min_height <= image.naturalHeight) &&
              (ls.filter_max_height_enabled !== 'true' ||
                image.naturalHeight <= ls.filter_max_height)))
        );
      });
    }

    displayImages();
  }, 200);
}

function displayImages() {
  $('#download_button').prop('disabled', true);

  const imagesContainer = $('#images_container');
  imagesContainer.empty();

  const columns = parseInt(ls.columns, 10);
  imagesContainer.css({
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    width: `calc(2 * var(--images-container-padding) + ${columns} * ${
      ls.image_max_width
    }px + ${columns - 1} * var(--images-container-gap))`,
  });

  const selectAllCheckbox = html`
    <div style=${{ gridColumn: '1 / -1', fontWeight: 'bold' }}>
      <${Checkbox}
        id="select_all_checkbox"
        onChange=${(e) => {
          $('#download_button').prop('disabled', !e.currentTarget.checked);
          for (let index = 0; index < visibleImages.length; index++) {
            $(`#card_${index}`).toggleClass('checked', e.currentTarget.checked);
          }
        }}
      >
        Select all (${visibleImages.length})
      <//>
    </div>
  `;
  imagesContainer.append(selectAllCheckbox);

  // Actions
  const show_image_url = ls.show_image_url === 'true';
  const show_open_image_button = ls.show_open_image_button === 'true';
  const show_download_image_button = ls.show_download_image_button === 'true';

  // Images
  visibleImages.forEach((imageUrl, index) => {
    const image = html`
      <div
        id=${`card_${index}`}
        class="card"
        onClick=${(e) => {
          $(e.currentTarget).toggleClass(
            'checked',
            !$(e.currentTarget).hasClass('checked')
          );

          let allAreChecked = true;
          let allAreUnchecked = true;
          for (let index = 0; index < visibleImages.length; index++) {
            if ($(`#card_${index}`).hasClass('checked')) {
              allAreUnchecked = false;
            } else {
              allAreChecked = false;
            }
            // Exit the loop early
            if (!(allAreChecked || allAreUnchecked)) break;
          }

          $('#download_button').prop('disabled', allAreUnchecked);

          const select_all_checkbox = $('#select_all_checkbox');
          select_all_checkbox.prop(
            'indeterminate',
            !(allAreChecked || allAreUnchecked)
          );
          if (allAreChecked) {
            select_all_checkbox.prop('checked', true);
          } else if (allAreUnchecked) {
            select_all_checkbox.prop('checked', false);
          }
        }}
      >
        <img
          src=${imageUrl}
          style=${{
            minWidth: `${ls.image_min_width}px`,
            maxWidth: `${ls.image_max_width}px`,
          }}
        />
        ${show_image_url &&
        html`<div class="image_url_container">
          <${ImageUrlTextbox}
            value=${imageUrl}
            onClick=${(e) => e.stopPropagation()}
          />
        </div>`}
        ${show_open_image_button &&
        show_download_image_button &&
        html`<div class="actions">
          ${show_open_image_button &&
          html`<${OpenImageButton}
            imageUrl=${imageUrl}
            onClick=${(e) => e.stopPropagation()}
          />`}
          ${show_download_image_button &&
          html`<${DownloadImageButton}
            imageUrl=${imageUrl}
            onClick=${(e) => e.stopPropagation()}
          />`}
        </div>`}
      </div>
    `;
    imagesContainer.append(image);
  });
}

function downloadImages() {
  if (ls.show_download_confirmation === 'true') {
    showDownloadConfirmation(startDownload);
  } else {
    startDownload();
  }

  function startDownload() {
    const checkedImages = [];
    for (let index = 0; index < visibleImages.length; index++) {
      if ($(`#card_${index}`).hasClass('checked')) {
        checkedImages.push(visibleImages[index]);
      }
    }
    ls.image_count = checkedImages.length;
    ls.image_number = 1;
    checkedImages.forEach((checkedImage) => {
      chrome.downloads.download({ url: checkedImage });
    });

    flashDownloadingNotification(ls.image_count);
  }
}

function showDownloadConfirmation(startDownload) {
  const saveDontShowAgainState = () => {
    ls.show_download_confirmation = !$('#dont_show_again_checkbox').prop(
      'checked'
    );
  };

  const removeNotificationContainer = () => {
    notification_container.remove();
  };

  const notification_container = html`
    <div style=${{ gridColumn: '1 / -1' }}>
      <div>
        <hr />
        Take a quick look at your browser settings and search for
        <b> download location</b>.
        <span class="danger">
          If the <b>Ask where to save each file before downloading</b> option is
          checked, proceeding might open a lot of popup windows. Proceed with
          the download?
        </span>
      </div>

      <div style=${{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <div style=${{ marginRight: 'auto' }}>
          <${Checkbox} id="dont_show_again_checkbox">
            Got it, don't show again
          <//>
        </div>

        <input
          type="button"
          class="ghost"
          value="Cancel"
          onClick=${() => {
            saveDontShowAgainState();
            removeNotificationContainer();
          }}
        />

        <input
          type="button"
          class="success"
          value="Yes, Download"
          onClick=${() => {
            saveDontShowAgainState();
            removeNotificationContainer();
            startDownload();
          }}
        />
      </div>
    </div>
  `;

  $('#downloads_container').append(notification_container);
}

function flashDownloadingNotification(imageCount) {
  if (ls.show_download_notification !== 'true') return;

  const downloading_notification = html`
    <div class="success">
      Downloading ${imageCount} ${imageCount > 1 ? 'images' : 'image'}...
    </div>
  `;

  $('#filters_container').append(downloading_notification);

  flash(downloading_notification, 3.5, 0, () => {
    downloading_notification.remove();
  });
}

function flash(element, flashes, interval, callback) {
  if (!interval) interval = parseInt(ls.animation_duration, 10);

  const fade = (fadeIn) => {
    if (flashes > 0) {
      flashes -= 0.5;
      if (fadeIn) {
        element.fadeIn(interval, () => fade(false));
      } else {
        element.fadeOut(interval, () => fade(true));
      }
    } else if (callback) {
      callback(element);
    }
  };
  fade(false);
}

$('main').append(html`
  <div id="filters_container">
    <table class="grid">
      <colgroup>
        <col />
        <col style=${{ width: '100px' }} />
      </colgroup>

      ${ls.show_url_filter === 'true' &&
      html`
        <tr>
          <td>
            <input
              type="text"
              id="filter_textbox"
              placeholder="Filter by URL"
              title="Filter by parts of the URL or regular expressions."
              value=${ls.filter_url}
              onKeyUp=${ls.show_url_filter === 'true' && filterImages}
              onChange=${(e) => {
                ls.filter_url = $.trim(e.currentTarget.value);
              }}
            />
          </td>

          <td>
            <select
              value=${ls.filter_url_mode}
              onChange=${(e) => {
                ls.filter_url_mode = e.currentTarget.value;
                filterImages();
              }}
            >
              <option value="normal" title="A plain text search">
                Normal
              </option>

              <option
                value="wildcard"
                title="You can also use these special symbols:
* → zero or more characters
? → zero or one character
+ → one or more characters"
              >
                Wildcard
              </option>

              <option
                value="regex"
                title=${`Regular expressions (advanced):
[abc] → A single character of: a, b or c
[^abc] → Any single character except: a, b, or c
[a-z] → Any single character in the range a-z
[a-zA-Z] → Any single character in the range a-z or A-Z
^ → Start of line
$ → End of line
A → Start of string
z → End of string
. → Any single character
s → Any whitespace character
S → Any non-whitespace character
d → Any digit
D → Any non-digit
w → Any word character (letter, number, underscore)
W → Any non-word character
 → Any word boundary character
(...) → Capture everything enclosed
(a|b) → a or b
a? → Zero or one of a
a* → Zero or more of a
a+ → One or more of a
a{3} → Exactly 3 of a
a{3,} → 3 or more of a
a{3,6} → Between 3 and 6 of a`}
              >
                Regex
              </option>
            </select>
          </td>
        </tr>
      `}
    </table>

    <table class="grid">
      <colgroup>
        <col style=${{ width: '45px' }} />
        <col style=${{ width: '40px' }} />
        <col style=${{ width: '10px' }} />
        <col />
        <col style=${{ width: '10px' }} />
        <col style=${{ width: '40px' }} />
      </colgroup>

      ${ls.show_image_width_filter === 'true' &&
      html`
        <tr id="image_width_filter">
          <td>Width:</td>

          <td style=${{ textAlign: 'right' }}>
            <label for="image_width_filter_min_checkbox">
              <small id="image_width_filter_min"></small>
            </label>
          </td>

          <td>
            <input
              type="checkbox"
              id="image_width_filter_min_checkbox"
              checked=${ls[`filter_min_width_enabled`] === 'true'}
              onChange=${(e) => {
                toggleDimensionFilter(
                  e.currentTarget,
                  `filter_min_width_enabled`,
                  e.currentTarget.checked
                );
              }}
            />
          </td>

          <td>
            <div id="image_width_filter_slider"></div>
          </td>

          <td>
            <input
              type="checkbox"
              id="image_width_filter_max_checkbox"
              checked=${ls[`filter_max_width_enabled`] === 'true'}
              onChange=${(e) => {
                toggleDimensionFilter(
                  e.currentTarget,
                  `filter_max_width_enabled`,
                  e.currentTarget.checked
                );
              }}
            />
          </td>

          <td style=${{ textAlign: 'right' }}>
            <label for="image_width_filter_max_checkbox">
              <small id="image_width_filter_max"></small>
            </label>
          </td>
        </tr>
      `}
      ${ls.show_image_height_filter === 'true' &&
      html`
        <tr id="image_height_filter">
          <td>Height:</td>

          <td style=${{ textAlign: 'right' }}>
            <label for="image_height_filter_min_checkbox">
              <small id="image_height_filter_min"></small>
            </label>
          </td>

          <td>
            <input
              type="checkbox"
              id="image_height_filter_min_checkbox"
              checked=${ls[`filter_min_height_enabled`] === 'true'}
              onChange=${(e) => {
                toggleDimensionFilter(
                  e.currentTarget,
                  `filter_min_height_enabled`,
                  e.currentTarget.checked
                );
              }}
            />
          </td>

          <td>
            <div id="image_height_filter_slider"></div>
          </td>

          <td>
            <input
              type="checkbox"
              id="image_height_filter_max_checkbox"
              checked=${ls[`filter_max_height_enabled`] === 'true'}
              onChange=${(e) => {
                toggleDimensionFilter(
                  e.currentTarget,
                  `filter_max_height_enabled`,
                  e.currentTarget.checked
                );
              }}
            />
          </td>

          <td style=${{ textAlign: 'right' }}>
            <label for="image_height_filter_max_checkbox">
              <small id="image_height_filter_max"></small>
            </label>
          </td>
        </tr>
      `}
    </table>

    ${ls.show_only_images_from_links === 'true' &&
    html`
      <${Checkbox}
        title="Only show images from direct links on the page; this can be useful on sites like Reddit"
        checked=${ls.only_images_from_links === 'true'}
        onChange=${(e) => {
          ls.only_images_from_links = e.currentTarget.checked;
          filterImages();
        }}
      >
        Only images from links
      <//>
    `}
  </div>

  <div id="images_cache"></div>

  <div id="images_container"></div>

  <div
    id="downloads_container"
    style=${{
      gridTemplateColumns: `${
        ls.show_file_renaming === 'true' ? '1fr' : ''
      } 1fr 100px`,
    }}
  >
    ${ls.show_file_renaming === 'true' &&
    html`
      <input
        type="text"
        placeholder="Rename files"
        title="Set a new file name for the images you want to download."
        value=${ls.new_file_name}
        onChange=${(e) => {
          ls.new_file_name = $.trim(e.currentTarget.value);
        }}
      />
    `}

    <input
      type="text"
      placeholder="Save to subfolder"
      title="Set the name of the subfolder you want to download the images to."
      value=${ls.folder_name}
      onChange=${(e) => {
        ls.folder_name = $.trim(e.currentTarget.value);
      }}
    />

    <input
      type="button"
      id="download_button"
      class="accent"
      value="Download"
      disabled="true"
      onClick=${downloadImages}
    />
  </div>
`);

chrome.downloads.onDeterminingFilename.addListener(suggestNewFilename);

if (
  ls.show_image_width_filter === 'true' ||
  ls.show_image_height_filter === 'true'
) {
  // Image dimension filters
  const serializeSliderValue = (label, option) => {
    return $.Link({
      target(value) {
        $(`#${label}`).html(`${value}px`);
        ls[option] = value;
        filterImages();
      },
    });
  };

  const initializeFilter = (dimension) => {
    $(`#image_${dimension}_filter_slider`).noUiSlider({
      behaviour: 'extend-tap',
      connect: true,
      range: {
        min: parseInt(ls[`filter_min_${dimension}_default`], 10),
        max: parseInt(ls[`filter_max_${dimension}_default`], 10),
      },
      step: 10,
      start: [ls[`filter_min_${dimension}`], ls[`filter_max_${dimension}`]],
      serialization: {
        lower: [
          serializeSliderValue(
            `image_${dimension}_filter_min`,
            `filter_min_${dimension}`
          ),
        ],
        upper: [
          serializeSliderValue(
            `image_${dimension}_filter_max`,
            `filter_max_${dimension}`
          ),
        ],
        format: { decimals: 0 },
      },
    });

    toggleDimensionFilter(
      $(`image_${dimension}_filter_min`),
      `filter_min_${dimension}_enabled`
    );

    toggleDimensionFilter(
      $(`image_${dimension}_filter_max`),
      `filter_max_${dimension}_enabled`
    );
  };

  // Image width filter
  if (ls.show_image_width_filter === 'true') {
    initializeFilter('width');
  }

  // Image height filter
  if (ls.show_image_height_filter === 'true') {
    initializeFilter('height');
  }
}

// Get images on the page
chrome.windows.getCurrent((currentWindow) => {
  chrome.tabs.query(
    { active: true, windowId: currentWindow.id },
    (activeTabs) => {
      chrome.tabs.executeScript(activeTabs[0].id, {
        file: '/src/send_images.js',
        allFrames: true,
      });
    }
  );
});

// Dynamic classes
jss.set('#images_container .card:hover', {
  'box-shadow': `0 0 0 ${ls.image_border_width}px var(--neutral)`,
});

jss.set('#images_container .card.checked', {
  'box-shadow': `0 0 0 ${ls.image_border_width}px ${ls.image_border_color}`,
});
