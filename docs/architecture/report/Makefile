FIGURES := $(patsubst %.tex,%.pdf,$(wildcard figures/*.tex))

.PHONY: all figures clean

all: figures
	latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex

figures: $(FIGURES)

figures/%.pdf: figures/%.tex
	latexmk -pdf -interaction=nonstopmode -halt-on-error -cd $<

clean:
	latexmk -C main.tex
	$(foreach figure,$(wildcard figures/*.tex),latexmk -C $(figure);)
