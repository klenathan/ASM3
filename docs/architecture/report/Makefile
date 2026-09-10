FIGURES := $(wildcard figures/*.png)

.PHONY: all figures clean

all: figures
	latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex

figures: $(FIGURES)

clean:
	latexmk -C main.tex
	$(foreach figure,$(wildcard figures/*.tex),latexmk -C $(figure);)
