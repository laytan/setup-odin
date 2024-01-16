# Setup Odin

A GitHub action to setup the [Odin](https://github.com/odin-lang/Odin) compiler with optional cached builds.

## Usage

See [action.yml](https://github.com/laytan/setup-odin/blob/main/action.yml)

### Example

Installs the latest Odin commit on the master branch and adds it to PATH.

When the `release` option is set below (default is set to `latest`), the action will download
a pre-compiled GitHub release instead of building from source.

To compile from source, set `release` to false or an empty string.

Using releases only works on `dev-2023-10` and later tags because it needs the exact LLVM version
it was built with in CI on the machine.

All options are optional and the defaults are shown below.

```yaml
steps:
  - uses: laytan/setup-odin@v1
    # with:
      # token: {{ secrets.GITHUB_TOKEN }}
      # release: latest
      # branch: master
      # llvm-version: 14
      # build-type: debug
      # repository: https://github.com/odin-lang/Odin
      # cache: false
```

### TODO

 - being able to pull in "nightly" releases
 - being able to pull in specific commit hashes
