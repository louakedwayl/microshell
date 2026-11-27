FROM i386/debian:bookworm-slim

ARG OH_MY_ZSH_REV=abfce729ab56543b976b08ef34a54b3dc57601a4
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    linux-image-686 initramfs-tools busybox-static zsh git openssh-client \
    ca-certificates curl nano locales procps iproute2 e2fsprogs \
    && mkdir -p /opt /workspace /out \
    && git clone --filter=blob:none https://github.com/ohmyzsh/ohmyzsh.git /root/.oh-my-zsh \
    && git -C /root/.oh-my-zsh checkout "$OH_MY_ZSH_REV" \
    && git -C /root/.oh-my-zsh rev-parse HEAD > /out/oh-my-zsh-revision.txt \
    && dpkg-query -W > /out/packages.tsv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /root/.oh-my-zsh/.git

COPY init /sbin/minishell-init
COPY zshrc /root/.zshrc
RUN chmod 755 /sbin/minishell-init \
    && printf 'minishell\n' > /etc/hostname \
    && printf '127.0.0.1 localhost minishell\n' > /etc/hosts \
    && printf 'en_US.UTF-8 UTF-8\n' > /etc/locale.gen \
    && locale-gen \
    && cp /boot/vmlinuz-* /out/vmlinuz.bin \
    && cp /boot/initrd.img-* /out/initrd.bin \
    && rm -rf /boot/* /lib/modules/*

CMD ["/bin/sh"]
