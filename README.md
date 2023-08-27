# Setup Odin

A GitHub action to setup the [Odin](https://github.com/odin-lang/Odin) compiler with optional cached builds.

## Usage

See [action.yml](https://github.com/laytan/setup-odin/blob/main/action.yml)

### Example

Installs the latest Odin commit on the master branch and adds it to PATH.

All options are optional and the defaults are shown below.

```yaml
steps:
  - uses: laytan/setup-odin@v1
    # with:
      # odin-version: master
      # llvm-version: 12
      # build-type: debug
      # repository: https://github.com/odin-lang/Odin
      # cache: true
```

### TODO

 - being able to pull in "nightly" releases
 - being able to pull in specific commit hashes
 - if odin version is a release or nightly, pull from website instead
 - caching llvm if that is even possible, also, I believe github does some smart stuff with system packages already
