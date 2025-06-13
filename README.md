# Setup Odin

A GitHub action to setup the [Odin](https://github.com/odin-lang/Odin) compiler.

## Usage

See [action.yml](https://github.com/laytan/setup-odin/blob/main/action.yml)

### Example

Installs Odin and adds it to the runner's PATH.

When the `release` option is set below (default is set to `latest`), the action will download
a pre-compiled GitHub release instead of building from source.

`release` can also be set to `nightly`, which will download a nightly release published on the Odin website.

To compile from source, set `release` to false or an empty string.

All options are optional and the defaults are commented below.

NOTE: you MUST set the `token` option to use GitHub releases, copying the setup below will automatically work
because the `GITHUB_TOKEN` secret is automatically set in an action.

```yaml
steps:
  - uses: laytan/setup-odin@v2
    with:
      token: ${{ secrets.GITHUB_TOKEN }}
    # with:
      # token: false
      # release: latest
      # branch: master
      # llvm-version: 18
      # build-type: debug
      # repository: https://github.com/odin-lang/Odin
```

### TODO

 - being able to pull in specific commit hashes
